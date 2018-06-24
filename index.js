// Imports the Google Cloud client library
const Translate = require('@google-cloud/translate');
const textToSpeech = require('@google-cloud/text-to-speech');
const speech = require('@google-cloud/speech');

// express
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
app.use(bodyParser.json());

// database
const mongoose = require('mongoose');
mongoose.connect("mongodb://localhost/khmervoice", function(error){
    if(error) console.log(error);
    console.log("connection successful");
});
mongoose.Promise = global.Promise;

// models
const User = require('./models/user');
const Parent = require('./models/parent');
const Item = require('./models/item');
const Feedback = require('./models/feedback');

// create file or folder
const fs = require('fs');
// upload file
const multer = require('multer');
const path = require('path');


// middleware
const logger = require('morgan');
app.use(logger('dev'))

// public folder
app.use('/public', express.static('./public'));

// webiste
app.use(express.static('public'));

// set the storage engine
const storage = multer.diskStorage({
  destination: function(req, file, next) {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    var folder = './public/uploads/' + year;
    // if the folder not exist yet, then create
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }
    folder += '/' + month;
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
    }

    next(null, folder)
  },
  filename: function(req, file, next) {
    next(null, Date.now() + path.extname(file.originalname));
  }
});

// check file type
function checkFileType(file, next) {
  // allowed extension
  const filetypes = /jpeg|jpg|png|gif|wav/;
  // check extension
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // check mime type
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return next(null, true);
  } else {
    next('Error: Alowed Images Only!');
  }
}

// Init Upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100000000
  },
  fileFilter: function(req, file, next) {
    checkFileType(file, next);
  }
}).single('image');

// Your Google Cloud Platform project ID
const projectId = 'af93dfaf54cf1232e2bcbfd237da291d254ef82f';

// Instantiates a client
const translate = new Translate({
  projectId: projectId,
});

// Instantiates
const clientTextToSpeech = new textToSpeech.TextToSpeechClient();

//
const clientSpeechToText = new speech.SpeechClient();

app.post('/api/translation', function(req, res, next){

    // The target language (eg: en, km, ...)
    const target = req.query.target;
    console.log(target);
    if (target == undefined) {
    	res.send("Bad Query");
    	return;
    }

    // console.log(res.body);

    var text = req.body.inputText;
    console.log("MY TEXT:"+text);
	// Translates some text into Russian
	translate
	  .translate(text, target)
	  .then(results => {

	    const translation = results[0];
	    console.log(`Text: ${text}`);
	    console.log(`Translation: ${translation}`);	    
	    res.send({
	    	"inputText": text,
	    	"translatedText": translation,
	    	"targetTranslation": req.body.targetTranslation,
	    	"inputSpeechUrl": req.body.inputSpeechUrl
	    });

	  })
	  .catch(err => {
	    console.error('ERROR:', err);
	    res.send("Translation Error");
	 });
});  


app.post('/api/speech-to-text', function(req, res, next){
    // The target language (eg: en, km, ...)
    const target = req.query.target;
    const platform = req.query.platform;
    
    if (target == undefined || platform == undefined) {
    	res.send("Bad Query");
    	return;
    }

    upload(req, res, function(err) {
      console.log(req.file);
      if (err) {
        	console.log("Photo API ERROR: " + err);

        	res.send("Error");
      } else {

        if (req.file == undefined) {
          	// the image not found
  			   res.send("Error: No file");

        } else {
         	 // uploaded successful
			const filename = req.file.path;
			const encoding = 'LINEAR16';

			var sampleRateHertz = 44100;
			if(platform == 'Android'){
				sampleRateHertz = 48000;
			}
			
			const languageCode = target;

			const config = {
			  encoding: encoding,
			  sampleRateHertz: sampleRateHertz,
			  languageCode: languageCode,
			};
			const audio = {
			  content: fs.readFileSync(filename).toString('base64'),
			};

			const request = {
			  config: config,
			  audio: audio,
			};

			// Detects speech in the audio file
			clientSpeechToText
			  .recognize(request)
			  .then(data => {

			    const response = data[0];
			    console.log(response);
			    const transcription = response.results
			      .map(result => result.alternatives[0].transcript)
			      .join('\n');
			    console.log(`Transcription: `, transcription);
			    res.send({
			    	"inputText": transcription,
			    	"translatedText": null,
			    	"targetTranslation": target,
			    	"inputSpeechUrl": req.file.path
			    });
			  })
			  .catch(err => {
			    console.error('ERROR:', err);
			  })


      	}
      }
    });  
});  

app.post('/api/text-to-speech', function(req, res, next){

    // The target language (eg: en, km, ...)
    const target = req.query.target;    
    
    if (target == undefined) {
    	res.send("Bad Query");
    	return;
    }
    console.log("Text: "+req.body.translatedText);
    console.log("Url: "+req.body.translatedSpeechUrl);
	const text = req.body.translatedText;
	// const outputFile = 'public/voices/output.mp3';
	// console.log(req.body.translatedSpeechUrl);	
	const outputFile = req.body.translatedSpeechUrl;

	const request = {
	  input: {text: text},
	  voice: {languageCode: target, ssmlGender: 'FEMALE'},
	  audioConfig: {audioEncoding: 'MP3'},
	};

	clientTextToSpeech.synthesizeSpeech(request, (err, response) => {
	  if (err) {
	    console.error('ERROR:', err);
	    return;
	  }

	  fs.writeFile(outputFile, response.audioContent, 'binary', err => {
	    if (err) {
	      console.error('ERROR:', err);
	      return;
	    }

	    console.log(`Audio content written to file: ${outputFile}`);

	    res.send(res.body);
	  });
	});

});


// create new user
app.post('/api/user', async function(req, res, next){
	
	var user = User(req.body);
	user._id = mongoose.Types.ObjectId();
	var result = await user.save();
  	res.send(result);

});

// create new parent
app.post('/api/parent', async function(req, res, next){
	
	var parent = Parent(req.body);
	parent._id = mongoose.Types.ObjectId();
	var result = await parent.save();
  	res.send(result);

});

// get new parent
app.get('/api/parent/:userId', async function(req, res, next){
	
	var parents = await Parent.find({userId: req.params.userId})
	.sort({createdAt: -1}).limit(30);
  	res.send(parents);

});

// create new item
app.post('/api/item', async function(req, res, next){
	var item = Item(req.body);
	item._id = mongoose.Types.ObjectId();
	var result = await item.save();
  	res.send(result);	
});

// get new parent
app.get('/api/item/:parentId', async function(req, res, next){
	console.log("/api/item/:parentId runing...");
	var parents = await Item.find({parentId: req.params.parentId});
  	res.send(parents);

});

// create new feedback
app.post('/api/feedback', async function(req, res, next){
	console.log("/api/feedback runing...");
	var feedback = Feedback(req.body);
	feedback._id = mongoose.Types.ObjectId();
	var result = await feedback.save();
  	res.send(result);	
});	


// catch 404 errors and forward them to error handling middleware
app.use(function(req, res, next){
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handling middleware
app.use(function(err, req, res, next){
  console.log(err);
  const error = app.get('env') === 'development' ? err : {};
  const status = err.status || 500;
  res.status(status).send({error: error.message});
});

// listen for requests
app.listen(process.env.port || 80, function(){
  console.log('now listening on port: localhost:80');
});
