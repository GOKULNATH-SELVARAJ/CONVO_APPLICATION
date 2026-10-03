const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/authMiddleware");
const Conversation = require("../models/Conversation");
const { MAX_GROUP_MEMBERS, MAX_GROUP_NAME_LENGTH } = require("../models/Conversation");
const Message = require("../models/message");
const User = require("../models/User");
const { postGroupEvent, emitConversationLists } = require("../utils/conversationEvents");

//New conversation (the logged-in user is always the sender)
router.post("/", auth, async (req, res) => {
  const senderId = req.userId;
  const receiverId = req.body.receiverId?.toString();

  try {
    if (senderId === receiverId) {
      return res.status(400).json({
        success: false,
        message: "Cannot create a conversation with yourself.",
      });
    }

    if (
      !mongoose.isValidObjectId(receiverId) ||
      !(await User.exists({ _id: receiverId }))
    ) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found.",
      });
    }

    // Check if conversation already exists
    const existingConversation = await Conversation.findOne({
      members: { $all: [senderId, receiverId], $size: 2 },
      // A two-person group is not the direct chat
      isGroup: { $ne: true },
    });

    if (existingConversation) {
      return res.status(409).json({
        success: false,
        message: "A conversation between these users already exists.",
        receiverId: receiverId,
      });
    }

    // If not, create new
    const newConversation = new Conversation({
      members: [senderId, receiverId],
    });

    const savedConversation = await newConversation.save();
    res.status(200).json(savedConversation);
  } catch (err) {
    console.log("err", err);

    res.status(500).json(err);
  }
});

// const { senderId, receiverId } = req.body;

// const existingConversationSender = await Conversation.findOne({
//   members: { $all: [senderId, receiverId] },
// });

// const existingConversationReceiver = await Conversation.findOne({
//   members: { $all: [receiverId, senderId] },
// });

// if (existingConversationSender) {
//   return res.status(400).json(existingConversationSender);
// }

// if (existingConversationReceiver) {
//   return res.status(200).json(existingConversationReceiver);
// }

//Get conversation

router.get("/:userId", auth, async (req, res) => {
  if (req.params.userId !== req.userId) {
    return res.status(403).json("You can only view your own conversations");
  }

  try {
    const conversation = await Conversation.find({
      members: { $in: [req.params.userId] },
    }).sort({ lastMessageAt: -1 });

    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json(error);
  }
});

// ----------------------
// Groups
// ----------------------

const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });

const cleanName = (name) =>
  typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";

const validName = (name) =>
  name.length > 0 && name.length <= MAX_GROUP_NAME_LENGTH;

// Distinct, existing user ids other than `exceptId`, or null if any is invalid.
const resolveUserIds = async (ids, exceptId) => {
  if (!Array.isArray(ids)) return null;
  const unique = [...new Set(ids.map(String))].filter((id) => id !== exceptId);
  if (!unique.every((id) => mongoose.isValidObjectId(id))) return null;
  const found = await User.countDocuments({ _id: { $in: unique } });
  return found === unique.length ? unique : null;
};

// Loads a group the user belongs to. Sends the error response and returns
// null otherwise; `adminOnly` also requires the user to be an admin.
const loadGroup = async (req, res, { adminOnly = false } = {}) => {
  const { id } = req.params;
  const group = mongoose.isValidObjectId(id)
    ? await Conversation.findOne({ _id: id, isGroup: true, members: req.userId })
    : null;
  if (!group) {
    fail(res, 404, "Group not found.");
    return null;
  }
  if (adminOnly && !(group.admins || []).includes(req.userId)) {
    fail(res, 403, "Only group admins can do that.");
    return null;
  }
  return group;
};

// Create a group: { name, memberIds } (the creator is added and made admin)
router.post("/group", auth, async (req, res) => {
  try {
    const name = cleanName(req.body.name);
    if (!validName(name)) {
      return fail(res, 400, `Group name must be 1–${MAX_GROUP_NAME_LENGTH} characters.`);
    }
    const memberIds = await resolveUserIds(req.body.memberIds, req.userId);
    if (!memberIds || memberIds.length === 0) {
      return fail(res, 400, "Choose at least one valid member.");
    }
    if (memberIds.length + 1 > MAX_GROUP_MEMBERS) {
      return fail(res, 400, `A group can have at most ${MAX_GROUP_MEMBERS} members.`);
    }

    const group = await Conversation.create({
      isGroup: true,
      name,
      members: [req.userId, ...memberIds],
      admins: [req.userId],
      createdBy: req.userId,
      lastMessageAt: new Date(),
    });

    await postGroupEvent(req.app.get("io"), group, req.userId, {
      action: "created",
      name,
    });
    res.status(200).json(await Conversation.findById(group._id));
  } catch (error) {
    console.error("❌ Error creating group:", error);
    res.status(500).json({ success: false, message: "Could not create group." });
  }
});

// Rename: { name }
router.patch("/group/:id", auth, async (req, res) => {
  try {
    const group = await loadGroup(req, res, { adminOnly: true });
    if (!group) return;

    const name = cleanName(req.body.name);
    if (!validName(name)) {
      return fail(res, 400, `Group name must be 1–${MAX_GROUP_NAME_LENGTH} characters.`);
    }
    if (name !== group.name) {
      group.name = name;
      await group.save();
      await postGroupEvent(req.app.get("io"), group, req.userId, {
        action: "renamed",
        name,
      });
    }
    res.status(200).json(await Conversation.findById(group._id));
  } catch (error) {
    console.error("❌ Error renaming group:", error);
    res.status(500).json({ success: false, message: "Could not rename group." });
  }
});

// Add members: { memberIds }
router.post("/group/:id/members", auth, async (req, res) => {
  try {
    const group = await loadGroup(req, res, { adminOnly: true });
    if (!group) return;

    const requested = await resolveUserIds(req.body.memberIds, req.userId);
    if (!requested) return fail(res, 400, "Choose valid members to add.");
    const newIds = requested.filter((id) => !group.members.includes(id));
    if (newIds.length === 0) return fail(res, 400, "They are already members.");
    if (group.members.length + newIds.length > MAX_GROUP_MEMBERS) {
      return fail(res, 400, `A group can have at most ${MAX_GROUP_MEMBERS} members.`);
    }

    // New members can read the history; count it as read for them so they
    // don't start with a huge unread badge and old ticks stay settled.
    await Message.updateMany(
      { conversationId: String(group._id) },
      { $addToSet: { seenBy: { $each: newIds } } },
    );
    group.members.push(...newIds);
    await group.save();

    await postGroupEvent(req.app.get("io"), group, req.userId, {
      action: "added",
      targets: newIds,
    });
    res.status(200).json(await Conversation.findById(group._id));
  } catch (error) {
    console.error("❌ Error adding members:", error);
    res.status(500).json({ success: false, message: "Could not add members." });
  }
});

// Remove a member (admins; to remove yourself, leave)
router.delete("/group/:id/members/:memberId", auth, async (req, res) => {
  try {
    const group = await loadGroup(req, res, { adminOnly: true });
    if (!group) return;

    const { memberId } = req.params;
    if (memberId === req.userId) return fail(res, 400, "Use leave to exit the group.");
    if (!group.members.includes(memberId)) return fail(res, 404, "Not a member.");

    group.members = group.members.filter((id) => id !== memberId);
    group.admins = (group.admins || []).filter((id) => id !== memberId);
    await group.save();

    await postGroupEvent(
      req.app.get("io"),
      group,
      req.userId,
      { action: "removed", targets: [memberId] },
      [memberId],
    );
    res.status(200).json(await Conversation.findById(group._id));
  } catch (error) {
    console.error("❌ Error removing member:", error);
    res.status(500).json({ success: false, message: "Could not remove member." });
  }
});

// Leave the group. The last admin leaving hands admin to the longest-standing
// member; the last member leaving deletes the group.
router.post("/group/:id/leave", auth, async (req, res) => {
  try {
    const group = await loadGroup(req, res);
    if (!group) return;

    group.members = group.members.filter((id) => id !== req.userId);
    group.admins = (group.admins || []).filter((id) => id !== req.userId);

    if (group.members.length === 0) {
      await Message.deleteMany({ conversationId: String(group._id) });
      await group.deleteOne();
      return res.status(200).json({ success: true, deleted: true });
    }
    if (group.admins.length === 0) group.admins = [group.members[0]];
    await group.save();

    await postGroupEvent(
      req.app.get("io"),
      group,
      req.userId,
      { action: "left" },
      [req.userId],
    );
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Error leaving group:", error);
    res.status(500).json({ success: false, message: "Could not leave group." });
  }
});

// Make a member admin / dismiss as admin
const setAdmin = (makeAdmin) => async (req, res) => {
  try {
    const group = await loadGroup(req, res, { adminOnly: true });
    if (!group) return;

    const { memberId } = req.params;
    if (!group.members.includes(memberId)) return fail(res, 404, "Not a member.");

    const admins = new Set(group.admins || []);
    if (makeAdmin) admins.add(memberId);
    else admins.delete(memberId);
    if (admins.size === 0) return fail(res, 400, "A group needs at least one admin.");

    group.admins = [...admins];
    await group.save();

    const io = req.app.get("io");
    await emitConversationLists(io, group.members);
    res.status(200).json(group);
  } catch (error) {
    console.error("❌ Error changing admins:", error);
    res.status(500).json({ success: false, message: "Could not change admins." });
  }
};
router.post("/group/:id/admins/:memberId", auth, setAdmin(true));
router.delete("/group/:id/admins/:memberId", auth, setAdmin(false));

module.exports = router;
