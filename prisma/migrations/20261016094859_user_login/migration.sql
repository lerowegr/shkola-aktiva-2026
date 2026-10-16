-- Логин для самостоятельной регистрации по паролю.
ALTER TABLE "users" ADD COLUMN "login" TEXT;
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");
