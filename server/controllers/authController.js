const User = require("../models/User");
const bcrypt = require("bcryptjs");
const {
 generateAccessToken,
 generateRefreshToken
} = require("../utils/token");

exports.login = async (req,res)=>{

 const { email,password } = req.body;

 const user = await User.findOne({ email });

 if(!user) return res.status(401).json({msg:"User not found"});

 const match = await bcrypt.compare(password,user.password);

 if(!match) return res.status(401).json({msg:"Wrong password"});

 // 🔥 JWT CREATED HERE
 const accessToken = generateAccessToken(user._id);
 const refreshToken = generateRefreshToken(user._id);

 // (optional) save refresh token in DB
 user.refreshToken = refreshToken;
 await user.save();

 res.json({
   user,
   accessToken,
   refreshToken
 });
};
