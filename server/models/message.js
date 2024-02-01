const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
    },
    sender: {
      type: String,
    },
    text: {
      type: String,
    },
    date: {
      type: Date,
    },
    seen: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);
messageSchema.pre("save", function (next) {
  if (!this.date) {
    this.date = new Date();
  }
  next();
});

module.exports = mongoose.model("Message", messageSchema);
