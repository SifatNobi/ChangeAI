import jwt from "jsonwebtoken";
import config from "../config/index.js";

const auth = (req, res, next) => {
  try {
    const authHeader = req.header("Authorization") || req.header("authorization") || "";
    const token = String(authHeader).replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return res.status(401).json({ message: "No authentication token, access denied" });
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = {
      ...decoded,
      id: decoded.id || decoded.userId || decoded.sub
    };
    next();
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

export default auth;
export { auth };

