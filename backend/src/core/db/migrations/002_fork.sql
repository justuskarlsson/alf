ALTER TABLE sessions ADD COLUMN forked_from TEXT REFERENCES sessions(id);
ALTER TABLE sessions ADD COLUMN fork_point_turn_idx INTEGER;
