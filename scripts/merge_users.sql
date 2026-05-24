CREATE OR REPLACE FUNCTION merge_users(duplicate_email TEXT, primary_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    duplicate_user_id TEXT;
    primary_user_id TEXT;
    duplicate_user_name TEXT;
    primary_user_name TEXT;
BEGIN
    -- 1. Find both users by email
    SELECT id, name INTO duplicate_user_id, duplicate_user_name FROM public.users WHERE email = duplicate_email LIMIT 1;
    SELECT id, name INTO primary_user_id, primary_user_name FROM public.users WHERE email = primary_email LIMIT 1;

    -- Validate they exist
    IF duplicate_user_id IS NULL THEN
        RAISE EXCEPTION 'Duplicate user with email % not found', duplicate_email;
    END IF;
    
    IF primary_user_id IS NULL THEN
        RAISE EXCEPTION 'Primary user with email % not found', primary_email;
    END IF;

    -- Prevent merging into self
    IF duplicate_user_id = primary_user_id THEN
        RAISE EXCEPTION 'Cannot merge a user into themselves';
    END IF;

    -- 2. Update equipment (assigned_to: text)
    UPDATE public.equipment 
    SET assigned_to = primary_user_id 
    WHERE assigned_to = duplicate_user_id;

    -- 3. Update shoots (created_by: text - stores name)
    UPDATE public.shoots 
    SET created_by = primary_user_name 
    WHERE created_by = duplicate_user_name;

    -- 4. Update assignments (user_id: text)
    DELETE FROM public.assignments a
    WHERE a.user_id = duplicate_user_id 
    AND EXISTS (
        SELECT 1 FROM public.assignments a2 
        WHERE a2.user_id = primary_user_id AND a2.shoot_id = a.shoot_id
    );
    
    UPDATE public.assignments 
    SET user_id = primary_user_id 
    WHERE user_id = duplicate_user_id;

    -- 5. Update leaves (user_id: text, approver_id: text)
    UPDATE public.leaves 
    SET user_id = primary_user_id 
    WHERE user_id = duplicate_user_id;
    
    UPDATE public.leaves 
    SET approver_id = primary_user_id 
    WHERE approver_id = duplicate_user_id;

    -- 6. Update logs (user_id: text)
    UPDATE public.logs 
    SET user_id = primary_user_id 
    WHERE user_id = duplicate_user_id;

    -- 7. Update notifications (user_id: uuid)
    UPDATE public.notifications 
    SET user_id = primary_user_id::uuid 
    WHERE user_id = duplicate_user_id::uuid;

    -- 8. Update user_sessions (user_id: uuid)
    UPDATE public.user_sessions 
    SET user_id = primary_user_id::uuid 
    WHERE user_id = duplicate_user_id::uuid;

    -- 9. Update push tokens (user_id: text)
    UPDATE public.push_tokens
    SET user_id = primary_user_id
    WHERE user_id = duplicate_user_id;

    -- 10. Update transactions (user_id: text)
    UPDATE public.transactions 
    SET user_id = primary_user_id 
    WHERE user_id = duplicate_user_id;

    -- 11. Update transactions (additional_users: text[])
    UPDATE public.transactions
    SET additional_users = array_replace(additional_users, duplicate_user_id, primary_user_id)
    WHERE duplicate_user_id = ANY(additional_users);
    
    UPDATE public.transactions
    SET additional_users = (
        SELECT array_agg(DISTINCT elem)
        FROM unnest(additional_users) AS elem
    )
    WHERE primary_user_id = ANY(additional_users);

    -- 12. Delete the duplicate from public.users
    DELETE FROM public.users WHERE id = duplicate_user_id;
END;
$$;
