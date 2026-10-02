const jwt = require("jsonwebtoken");

module.exports = (req,res,next)=>{

 const authHeader = req.headers.authorization;

 if(!authHeader) return res.sendStatus(401);

 const token = authHeader.split(" ")[1];

 try{
   const decoded = jwt.verify(token,process.env.JWT_SECRET);

   req.userId = decoded.userId;

   next();

 }catch(err){
   res.sendStatus(403);
 }
};
