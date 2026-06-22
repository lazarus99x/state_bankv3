  Got it. Schema uses profiles → admin_profiles chain. Here's the SQL — run in Supabase SQL Editor:

    sql
    -- 1. Get the auth user ID (paste the result into step 2)
    SELECT id, email FROM auth.users WHERE email = 'lazarus99x@gmail.com';

    -- 2. Replace 'AUTH_USER_UUID_HERE' with the UUID from step 1
    -- Find the profile id
    DO $$
    DECLARE
        v_auth_user_id UUID := 'AUTH_USER_UUID_HERE';  -- ← REPLACE THIS
        v_profile_id   UUID;
    BEGIN
        -- Get or create profile
        SELECT id INTO v_profile_id FROM profiles WHERE user_id = v_auth_user_id;
        IF NOT FOUND THEN
            INSERT INTO profiles (user_id, email, kyc_status)
            VALUES (v_auth_user_id, 'lazarus99x@gmail.com', 'verified')
            RETURNING id INTO v_profile_id;
        END IF;

        -- Insert admin profile (super_admin with all perms)
        INSERT INTO admin_profiles (user_id, role, permissions)
        VALUES (
            v_profile_id,
            'super_admin',
            '{
                "can_manage_users": true,
                "can_manage_accounts": true,
                "can_approve_loans": true,
                "can_process_transactions": true,
                "can_manage_settings": true,
                "can_view_audit_logs": true,
                "can_manage_admins": true
            }'::JSONB
        )
        ON CONFLICT (user_id) DO UPDATE
            SET role = 'super_admin',
                permissions = EXCLUDED.permissions;

        -- Update JWT claims so the token carries admin role
        UPDATE auth.users
        SET raw_app_meta_data =
            COALESCE(raw_app_meta_data, '{}'::JSONB) ||
            '{"role": "super_admin"}'::JSONB
        WHERE id = v_auth_user_id;

        RAISE NOTICE 'Done. Profile: %, admin granted.', v_profile_id;
    END $$;

    -- 3. Verify
    SELECT p.email, ap.role, ap.permissions
    FROM admin_profiles ap
    JOIN profiles p ON p.id = ap.user_id
    WHERE p.email = 'lazarus99x@gmail.com';


    How to run:
    1. Copy into Supabase SQL Editor
    2. Run step 1 to get the UUID
    3. Replace AUTH_USER_UUID_HERE with that UUID
    4. Run the full script

    Important: The raw_app_meta_data update ensures the JWT token carries the admin claim — but the existing token you're already logged in with won't have it. You need to log out and log back in (or refresh the session) for Supabase to issue a new JWT with role: super_admin. If the app checks is_admin() via admin_profiles table lookup (which it does — see is_admin() in 002_rls.sql), then the INSERT alone is enough for RLS. The JWT update is only needed if the app also checks claims client-side.