const fabric = require('fabric').fabric
//import { PSBrush } from "@arch-inc/fabricjs-psbrush"
const PSBrush = require('@arch-inc/fabricjs-psbrush').PSBrush

const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;
const uniqid=require('uniqid')
const querystring=require('querystring')
const fs = require('fs')

const boardspath = "data/boards/"

require('dotenv').config()

/* configure s3 */
process.env.AWS_ACCESS_KEY_ID     = process.env.BUCKETEER_AWS_ACCESS_KEY_ID;
process.env.AWS_SECRET_ACCESS_KEY = process.env.BUCKETEER_AWS_SECRET_ACCESS_KEY;
process.env.AWS_REGION            = 'us-east-1';
var AWS = require('aws-sdk');
var s3  = new AWS.S3();


const cloudinary = require("cloudinary");

app.use(express.json({limit:'50mb'}));


/*cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET
});*/

// image upload API
app.post("/image-upload", (request, response) => {

    var image = request.body.image
    //image =  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=="

    // upload image here
    //console.log(request.body.image)
    cloudinary.v2.uploader.upload(image)
    .then((result) => {
      response.json({'url':result.secure_url})
    }).catch((error) => {
      console.log(error)
      response.json({'url':''})
    });
});



class sharedBoardManager {
  constructor() {
    this.boards = [] // boardid->sharedBoard mapping
    this.users = []  // usersid->boardid mapping
  }

  getBoard(socket) {
    if (socket.id in this.users &&  this.users[socket.id] in this.boards) {
      return this.boards[this.users[socket.id]]
    } else {
      return undefined
    }
  }

  onJoin(socket,data) {
    if (!('boardid' in data)) { //todo: more validation
      return
    }

    if (!(data.boardid in this.boards)) { //  try to load board
      this.boards[data.boardid] = new sharedBoard(data.boardid) // create new board object
      let that = this
      console.log('loading board '+ data.boardid+".brd")
      this.boards[data.boardid].loadBoard(data.boardid+".brd", function () {
        that.users[socket.id]=data.boardid
        let board = that.getBoard(socket)
        socket.join(data.boardid)
        board.onJoin(socket)
      })
    } else {
      this.users[socket.id]=data.boardid
      let board = this.getBoard(socket)
      socket.join(data.boardid)
      board.onJoin(socket)
    }

  }

  onEraseBoard(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onEraseBoard(socket,data)
    }
  }
  onViewSync(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onViewSync(socket,data)
    }
  }
  onObjectsAdded(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onObjectsAdded(socket,data)
    }
  }
  onObjectsModified(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onObjectsModified(socket,data)
    }
  }
  onObjectsErased(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onObjectsErased(socket,data)
    }
  }
  onUndo(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onUndo(socket,data)
    }
  }
  onRedo(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onRedo(socket,data)
    }
  }
  onSave(socket,data) {
    let board = this.getBoard(socket)
    if (board) {
      board.onSave(socket,data)
    }
  }

}

class sharedBoard {

  constructor(boardid)  {
    this.canvas = new fabric.StaticCanvas(); // for keeping track of the canvas

    this.history = []
    this.redohistory = []
    this.nextClientID = 0 // to assign unique ids to all clientss for generating unique object ids
    this.objectsByID = []

    this.boardid = boardid

    this.lastViewSyncData = null
  }

  loadBoard(filename, callback) {
    /*
    if (fs.existsSync(boardspath+data.boardid+'.brd')) { // load it if it was in a file
    try {
      var json = fs.readFileSync(filename,'utf8')
      //console.log(json)

      this.canvas.loadFromDatalessJSON(json)
    } catch (err) {
      console.error(err)
    } */

    var params={
     Key:    filename,
     Bucket: process.env.BUCKETEER_BUCKET_NAME
    }

    let that = this
    s3.headObject(params, function (err, metadata) {
      if (err && err.code === 'NotFound') {
        console.log('board not found, creating new')
        callback()
      } else {
        s3.getObject(params, function put(err, data) {
          if (err) {
            console.log('S3 board load failed')
            console.log(err, err.stack);
            callback()
          } else {
            that.canvas.loadFromDatalessJSON(data.Body.toString(), callback)
          }
        });
      }
    });

  }

  saveBoard(callback) {
    /*
    try {
      fs.writeFileSync(filename, JSON.stringify(this.canvas.toDatalessJSON(['id'])))
    } catch (err) {
      console.error(err)
    }*/

    s3.putObject(
        {
         Key:    this.boardid+'.brd',
         Bucket: process.env.BUCKETEER_BUCKET_NAME,
         Body:   JSON.stringify(this.canvas.toDatalessJSON(['id','padding'])),
         ContentType: 'application/json; charset=utf-8'
        }, function put(err, data) {
              if (err) {
                console.log('S3 save failed')
                console.log(err, err.stack);
              } else {
                console.log('S3 save successful!')
                console.log(data);
              }
              if (callback) {
                callback()
              }
            }
        )
  }

  onSave() {
    this.saveBoard()
  }
  autosave() {
    this.onSave() // hacky autosave
  }

  getRoom() {
    return io.in(this.boardid)
  }

  getNextClientID() {
    this.nextClientID += 1
    return this.nextClientID-1
  }

  onJoin(socket,data) {
    socket.emit('clientID', this.getNextClientID())
    socket.emit('canvasdata',this.canvas.toDatalessJSON(['id','padding']))
    socket.emit('viewSync', this.lastViewSyncData)
  }

  onEraseBoard(socket,data) {
    this.history.push(['eraseBoard',this.canvas.toDatalessJSON(['id','padding'])])
    this.redohistory = [] // clear redo history on new action

    this.canvas.clear()

    this.getRoom().emit('canvasdata',this.canvas.toDatalessJSON(['id','padding']))

    this.autosave()
  }

  onViewSync(socket,data) {
    this.lastViewSyncData = data
    socket.in(this.boardid).broadcast.emit('viewSync', data)
  }

  onObjectsErased(socket, data, mode='normal') {
    let that = this
    let oData = []

    data.forEach(function(oid) {
      if (oid in that.objectsByID) {
        let o = that.objectsByID[oid]
        that.canvas.remove(o)

        let oJSON = o.toJSON()
        oJSON.id = o.id
        oData.push(oJSON) // save for history

        delete that.objectsByID[oid]

      }

    })

    if (socket) {
      socket.in(this.boardid).broadcast.emit('objectsErased', data)
    } else {
      this.getRoom().emit('objectsErased', data)
    }

    if (mode=='normal') {
      this.history.push(['objectsErased',oData])
      this.redohistory = []
    } else if (mode=='redo') {
      this.history.push(['objectsErased',oData])
    } else if (mode=='undo') {
      this.redohistory.push(['objectsAdded',oData])
    }

    this.autosave()
  }

  onObjectsModified(socket, data, mode='normal') {
    console.log(data)

    let oHistData = [] // for history store previous values
    for (var o of data) {
      if (o.id in this.objectsByID) {
        let oTarget = this.objectsByID[o.id]
        let oHist = {}
        for (var key in o) {
          oHist[key]=oTarget[key]
          oTarget[key]=o[key]
        }
        oHistData.push(oHist)
      }
    }

    if (socket) {
      socket.in(this.boardid).broadcast.emit('objectsModified',data)
    } else {
      this.getRoom().emit('objectsModified',data)
    }
    if (mode=='normal') {
      this.history.push(['objectsModified',oHistData])
      this.redohistory = []
    } else if (mode=='redo') {
      this.history.push(['objectsModified',oHistData])
    } else if (mode=='undo') {
      this.redohistory.push(['objectsModified',oHistData])
    }

    this.autosave()
  }

  onObjectsAdded(socket,data,mode='normal') {
    //console.log(JSON.stringify(data))
    //console.log(JSON.stringify(data).length) - measure uncompressed size

    //data.id = this.getNextID() - replace in favor of client-side id's

    var that = this
    fabric.util.enlivenObjects(data, function(objects) {
      //var origRenderOnAddRemove = canvas.renderOnAddRemove;
      //canvas.renderOnAddRemove = false;
      objects.forEach(function(o) {
        that.canvas.add(o);
        that.objectsByID[o.id] = o
        console.log(o.id)
      });
      //canvas.renderOnAddRemove = origRenderOnAddRemove;
      //canvas.renderAll();
    });

    /*
    this.canvas_1.loadFromJSON({'objects':[data]})
    console.log([data])
    this.canvas.add(this.canvas_1._objects[0])*/
    if (socket) {
      socket.in(this.boardid).broadcast.emit('objectsAdded', data)
    } else {
      this.getRoom().emit('objectsAdded', data)
    }

    if (mode=='normal') {
      that.history.push(['objectsAdded', data])
      this.redohistory = [] // clear redo history on new action
    } else if (mode=='redo') {
      that.history.push(['objectsAdded', data])
    } else if (mode=='undo') {
      let objectIDs = []
      data.forEach(o=>objectIDs.push(o.id))
      that.redohistory.push(['objectsErased',objectIDs])
    }

    setTimeout(function() {that.autosave()},1000) // hack for images...
  }

  onUndo(socket,data) {
    let act = this.history.pop()
    if (act) {
      if (act[0]=='objectsAdded') {
        let objectIDs = []
        act[1].forEach(o=>objectIDs.push(o.id))
        this.onObjectsErased(null,objectIDs,'undo')
      } else if (act[0]=='objectsErased') {
        this.onObjectsAdded(null,act[1],'undo')
      } else if (act[0]=='objectsModified') {
        this.onObjectsModified(null,act[1],'undo')
      } else if (act[0]=='eraseBoard') {
        let that = this
        this.canvas.loadFromDatalessJSON(act[1], function() {
          that.canvas.forEachObject((o)=>that.objectsByID[o.id]=o)   //reset id list
          that.getRoom().emit('canvasdata',that.canvas.toDatalessJSON(['id','padding']))
          that.redohistory.push(['eraseBoard',null])
          that.autosave()
        })
      }

    }

  }

  onRedo(socket, data) {
    let act = this.redohistory.pop()
    if (act) {
      if (act[0]=='objectsAdded') {
        this.onObjectsAdded(null,act[1],'redo')
      } else if (act[0]=='objectsErased') {
        this.onObjectsErased(null,act[1],'redo')
      } else if (act[0]=='objectsModified') {
        this.onObjectsModified(null,act[1],'redo')
      } else if (act[0]=='eraseBoard') {
        this.canvas.clear()
        this.getRoom().emit('canvasdata',this.canvas.toDatalessJSON(['id','padding']))
        this.history.push(act)
      }


    }

    this.autosave()
  }
}

app.use(express.static(__dirname + '/public'));



app.get('/', function(req, res) {

  req.query['boardid']= req.query['boardid'] ? req.query['boardid'] : uniqid()

  //thispath = url.parse(req.url).pathname
  res.redirect('/board.html' + '?' + querystring.encode(req.query))
});

// https://github.com/brenden/node-webshot
const webshot = require('node-webshot');

// for server side need to use webshot; clientside same site can use dom-to-image
app.get('/domtoimage', function(req, res) {

  if (req.query.targetpath) {
    webshot(req.query.targetpath, 'public/images/temp.png', function(err) {
      console.log(err)
      res.redirect('images/temp.png')
    });
  } else {
    res.writeHead(200, {
        'Content-Type': 'text/html'
    });
    res.end('missing path')
  }

});

// clone board API
app.get("/cloneboard", (req, res) => {
  boardid = uniqid()
  newboard = new sharedBoard(boardid) // create new board object
  console.log('Cloning '+req.query['boardid']+".brd")
  newboard.loadBoard(req.query['boardid']+".brd", function () {
    newboard.saveBoard( function () {
      res.redirect('/board.html?boardid='+boardid)
    })
  })
})


bm  = new sharedBoardManager()

function onConnection(socket) {
  socket.on('joinBoard', (data)=>bm.onJoin(socket,data))

  socket.on('saveBoard', (data)=>bm.onSave(socket,data))

  socket.on('eraseBoard',  (data)=>bm.onEraseBoard(socket,data))
  socket.on('viewSync',  (data)=>bm.onViewSync(socket,data))
  socket.on('objectsAdded',  (data)=>bm.onObjectsAdded(socket,data))
  socket.on('objectsModified',  (data)=>bm.onObjectsModified(socket,data))
  socket.on('objectsErased',  (data)=>bm.onObjectsErased(socket,data))
  socket.on('undo',  (data)=>bm.onUndo(socket,data))
  socket.on('redo',  (data)=>bm.onRedo(socket,data))
}

io.on('connection', onConnection);

http.listen(port, () => console.log('listening on port ' + port));
