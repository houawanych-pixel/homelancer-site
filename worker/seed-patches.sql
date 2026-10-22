-- Verified game releases (each shipped to the live beta with its full test run passing). Applied once, on first deploy.
INSERT INTO patches (version, released, title, items, published, created)
SELECT 'v1.9k', '2026-10-20', 'Homelancer Beta', '[{"type":"fixed","text":"Far planets no longer flicker on and off"},{"type":"improved","text":"Tap the mission line at the top to set a waypoint; GO TO flies the whole job, through jump gates and in to dock"},{"type":"added","text":"Handing in a captured bounty: the giver thanks you, pays and opens the bounty board"},{"type":"improved","text":"Bigger mission board text; every job has a picture"},{"type":"improved","text":"Music changes by star system; big fights get epic music"},{"type":"improved","text":"Bottom-left flight buttons in order: engine kill, stop, thrust, warp"}]', 1, strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM patches WHERE version = 'v1.9k');
INSERT INTO patches (version, released, title, items, published, created)
SELECT 'v1.9l', '2026-10-20', 'Homelancer Beta', '[{"type":"added","text":"SPECIAL before it charges = EVADE: climb, dive, burst and barrel rolls by stick direction; tap again while climbing or diving for a U-turn"}]', 1, strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM patches WHERE version = 'v1.9l');
INSERT INTO patches (version, released, title, items, published, created)
SELECT 'v1.9m', '2026-10-20', 'Homelancer Beta', '[{"type":"added","text":"New mission pictures, framed in difficulty colours from blue to gold"}]', 1, strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM patches WHERE version = 'v1.9m');
INSERT INTO patches (version, released, title, items, published, created)
SELECT 'v1.9n', '2026-10-20', 'Homelancer Beta', '[{"type":"added","text":"SILVER fleet invasion missions: battleships, warships and a command station, with allied fighters on your side"}]', 1, strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM patches WHERE version = 'v1.9n');
INSERT INTO patches (version, released, title, items, published, created)
SELECT 'v1.9o', '2026-10-20', 'Homelancer Beta', '[{"type":"improved","text":"Mission board: tap a job to hear it read aloud, then ACCEPT or DECLINE; drop a job any time with DISENGAGE"},{"type":"added","text":"Taking a prisoner to their own faction frees them, turns that faction hostile and locks its mission board"}]', 1, strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM patches WHERE version = 'v1.9o');
INSERT INTO patches (version, released, title, items, published, created)
SELECT 'v1.9p', '2026-10-20', 'Homelancer Beta', '[{"type":"fixed","text":"The chase camera no longer goes inside the ground or walls"},{"type":"improved","text":"Map: SET WAYPOINT and GO buttons beside the current mission"}]', 1, strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM patches WHERE version = 'v1.9p');
