DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS round;

CREATE TABLE user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);

CREATE TABLE round (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player TEXT NOT NULL,
  day DATE NOT NULL,
  course TEXT NOT NULL,
  tees TEXT NOT NULL,
  descr TEXT,
  score INTEGER
);