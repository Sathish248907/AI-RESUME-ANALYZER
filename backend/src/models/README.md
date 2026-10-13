# models

The database schema is defined in `prisma/schema.prisma` (Prisma is the ORM).
This folder holds repositories — the only code that talks to Prisma — so controllers
and services never build queries directly and every query is scoped to the owning user.

- `analysisRepository.js` — create / list / get / delete / replace analyses per user.
