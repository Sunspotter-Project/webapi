import { Database } from './shared/db/db.mjs';
import createError from 'http-errors';
import express from 'express';
//import sqlite from './db/aa-sqlite.mjs';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';

import indexRouter from './routes/index.mjs';
import usersRouter from './routes/users.mjs';
import webcamRouter from './routes/webcam.mjs';


/*
var dbfile = './db/webcam.db';
sqlite.open(dbfile).catch(function(err) { console.error(err + ', DB file: ' + dbfile); });
*/


// initialize database
const dbname = (process.env.DBNAME || "sunspotter");
const dbusername = (process.env.DBUSERNAME || "postgres");
const dbpassword = (process.env.DBPASSWORD || "GVHb52QJBu5Ih9BoQzKY");
const dbHost = (process.env.DBHOST || 'localhost');

try {
  await Database.init(dbHost, dbname, dbusername, dbpassword);
  console.log(`Database connection to host '${dbHost}' has been established successfully.`);
} catch (error) {
  console.error(`Unable to connect to the database ${dbname} with ${dbusername}:`, error);
}


function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

var __dirname = path.resolve();

var app = express();
var port = normalizePort(process.env.PORT || '3001');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/webcam', webcamRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// Start the server
app.listen(port, () => {
  console.log(`Voyager listening on port ${port}`);
  console.log('Press Ctrl+C to quit.');
});

export default app;
