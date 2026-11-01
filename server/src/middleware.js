export function requireUser(req, res, next) {
  // Every private route gets its owner from the server-created session, never from request data.
  if (!req.session.userId)
    return res.status(401).json({ message: "Please sign in to continue." });
  next();
}

export function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}
