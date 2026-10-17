-- Separate database for automated tests, so they never touch dev data.
CREATE DATABASE todo_test OWNER todo;
