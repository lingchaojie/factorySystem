-- Add one task state; existing tasks and business records retain their values.
ALTER TYPE "WorkItemStatus" ADD VALUE 'in_progress' AFTER 'pending';
