export function createAuthController(authService) {
  return {
    async register(req, res, next) {
      try {
        const result = await authService.register(req.body);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },

    async login(req, res, next) {
      try {
        const result = await authService.login(req.body);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },

    async me(req, res, next) {
      try {
        const user = await authService.getUser(req.user.id);
        res.json({ user });
      } catch (err) {
        next(err);
      }
    },
  };
}
