Facts the used set needs from test.prisma (what a parser must let us compute):
1. User → table "users"; Post → "Post"; AuditLog ignored (whole model)
2. User.fullName → column "full_name"; Post.authorId → "author_id"; User.legacy ignored
3. User.posts and Post.author are relation fields: no column
4. fullName native type VarChar(255); email: String with no @db (→ text)
5. defaults: id autoincrement(); createdAt now(); status "draft"; role USER; token dbgenerated(...)
6. enum Role → DB name "user_role"; value ADMIN stored as "admin_role"
7. unique indexes by DB name: users_pk (id), User_email_key? (default name for email — on table "users" → "users_email_key"), users_handle_uq, users_full_name_role_key (compound), Post_pkey
8. invalid schema → error, not a crash
