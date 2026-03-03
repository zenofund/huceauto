DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'PENDING'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'UserStatus'
      )
  ) THEN
    ALTER TYPE "UserStatus" ADD VALUE 'PENDING';
  END IF;
END $$;
