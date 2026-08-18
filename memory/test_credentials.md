# Test Credentials

## Admin Account (preview environment DB)
- Username: admin
- Password: admin123

## Note on fresh deployments
- The seed scripts (backend/seed_data.py, backend/routes/seed_routes.py) create
  default users with password `password123` on a BRAND-NEW/empty database:
  - admin / password123 (Administrator)
  - peter / password123 (Sales Manager)
- The current preview database admin password is `admin123` (changed after seeding).
- Admin can reset any user's password: System → User Management → "Reset Pw"
  (POST /api/auth/users/{username}/reset-password, admin only).
