-- Hand-written constraint
ALTER TABLE "User" ADD CONSTRAINT "User_name_not_empty" CHECK (length("name") > 0);
