/* eslint-disable @typescript-eslint/ban-ts-comment */
import { MongoClient } from 'mongodb';
import env from 'dotenv';
import socketio from 'socket.io';
import express from 'express';
// @ts-ignore
import xxhash from 'xxhash';

const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const genRanHex = (size: number) =>
  [...Array(size)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('');

env.config();

const uri = process.env.URI || '';
const client = new MongoClient(uri, { useNewUrlParser: true });
function sortObjectKeys(obj: Record<string, any>) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj !== 'object') {
    // it is a primitive: number/string (in an array)
    return obj;
  }
  return Object.keys(obj)
    .sort()
    .reduce((acc: any[] | Record<string, any> | any, key) => {
      if (Array.isArray(obj[key])) {
        acc[key] = obj[key].map(sortObjectKeys);
      } else if (typeof obj[key] === 'object') {
        acc[key] = sortObjectKeys(obj[key]);
      } else {
        acc[key] = obj[key];
      }
      return acc;
    }, {});
}
const hash64 = function (Obj: any) {
  const SortedObject: any = sortObjectKeys(Obj);
  const jsonstring = JSON.stringify(SortedObject, (k, v) => {
    return v === undefined ? 'undef' : v;
  });

  // Remove all whitespace
  const jsonstringNoWhitespace: string = jsonstring.replace(/\s+/g, '');

  const JSONBuffer: Buffer = Buffer.from(jsonstringNoWhitespace, 'binary'); // encoding: encoding to use, optional.  Default is 'utf8'
  return xxhash.hash64(JSONBuffer, 0xcafebabe, 'hex');
};

client.connect(err => {
  const users = client.db('social').collection('users');
  const tree = client.db('social').collection('tree');
  const sessions: Record<string, { ids: string[]; connected: boolean }> = {};
  // perform actions on the collection object
  console.log('Connected');
  io.on('connection', (socket: socketio.Socket) => {
    console.log('oh device?');
    socket.on('sessionStart', e => {
      console.log('starting session from ' + socket.id + ' with id ' + e);
      if (sessions[e]) {
        sessions[e].ids.push(socket.id);
      } else {
        sessions[e] = { ids: [socket.id], connected: false };
      }
    });
    socket.on('sessionSend', e => {
      console.log('sessions', sessions);
      console.log(e);
      if (sessions[e[1]]) {
        console.log('found recipient');
        console.log(
          sessions[e[1]].ids[
            sessions[e[1]].ids.indexOf(socket.id) === 0 ? 1 : 0
          ]
        );
        socket
          .to(
            sessions[e[1]].ids[
              sessions[e[1]].ids.indexOf(socket.id) === 0 ? 1 : 0
            ]
          )
          .emit('message', e);
      }
    });
    socket.on('disconnect', () => {
      console.log('cringe');
      let w: null | number = null;
      const h = Object.values(sessions).findIndex(e => {
        e.ids.forEach((f, i) => {
          if (f === socket.id) {
            w = i;
          }
        });
        if (w !== null) {
          return true;
        } else {
          return false;
        }
      });

      if (w !== null) {
        sessions[Object.keys(sessions)[h]].ids.splice(w, 1);
      }
      if (
        sessions[Object.keys(sessions)[h]] &&
        sessions[Object.keys(sessions)[h]].ids.length === 0
      )
        delete sessions[Object.keys(sessions)[h]];
    });
  });

  app.use(express.json());
  app.use(express.urlencoded());

  app.get('/checkname', async (q, s) => {
    // @ts-ignore
    const x = !!(await users.find({ username: q.query.name }).toArray()).length;
    console.log('checking name ' + q.query.name);
    console.log('taken = ' + x);
    if (err) {
      s.status(500).send(err);
    } else {
      s.json(x);
    }
  });
  app.get('/tree', async (q, s) => {
    // @ts-ignore
    console.log(q.query);
    const x = await tree
      .find(
        q.query.username === 'string'
          ? // @ts-ignore
            { 'body.key.username': q.query.username }
          : undefined
      )
      .toArray();
    x.sort((a, b) => b.ctime - a.ctime);
    // @ts-ignore
    if (err) {
      s.status(500).send(err);
      console.log(err);
    } else {
      s.json(x[0]);
    }
  });
  app.post('/UIDs', async (q, s) => {
    const e = await users.find({ username: q.body.name }).toArray();
    if (e.length) {
      s.status(409).send('Account exists');
      return;
    }
    const x = await users.insertOne({
      ctime: Date.now(),
      username: q.body.name
    });
    console.log(x);
    s.setHeader('Location', '/UIDs/' + x.insertedId);
    s.json(x.insertedId);
  });
  app.post('/tree', async (q, s) => {
    console.log(q.body);
    const body = q.body;
    tree
      .insertOne(body)
      .then(async res => {
        const x = await tree.find().toArray();
        s.status(201).json({ itemNo: x.length });
      })
      .catch(e => {
        s.status(500).send(e);
        console.log(e);
      });
  });
  http.listen(80, () => {
    console.log('listening on *');
  });
});
