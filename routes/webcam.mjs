import express from 'express';
import fs from 'fs';
import fetch from 'node-fetch';
import Webcam from '../shared/db/models/webcam.mjs';
import Prediction from '../shared/db/models/prediction.mjs';
import PredictionModelLabel from '../shared/db/models/predictionmodellabel.mjs';
import jsdom from 'jsdom';
import spawnSync from 'child_process';
import JSDOM from 'jsdom';
import PredictionRun from '../shared/db/models/predictionrun.mjs';

var router = express.Router();

router.get('/v2', async function(req, res, next) {
  var webcams;
  var predictionrun;
  var rawQuery;
  var limit, age;

  try {

    // limit query parameter
    if (req.query.limit !== undefined) {
      if (isNaN(req.query.limit)) {
        throw new Error(`The submit limit value ${req.query.limit} is not a number.`);
      } else {
        limit = parseInt(req.query.limit);
      }
    } else {
      limit = 50;
    }

    // age query parameter
    if (req.query.age !== undefined) {
      if (isNaN(req.query.age)) {
        throw new Error(`The submit age value ${req.query.age} is not a number.`);
      } else {
        age = parseInt(req.query.age);
      }
    } else {
      age = 1800; // 15min
    }

    rawQuery = `select pkpredictionrun, predictionrunid from "PredictionRuns" WHERE EXTRACT(EPOCH from (LOCALTIMESTAMP - "createdat")) < ${age} ORDER BY "createdat" DESC LIMIT 1`

    predictionrun = await PredictionRun.sequelize.query(rawQuery, {
      // A function (or false) for logging your queries
      // Will get called for every SQL query that gets sent
      // to the server.
      logging: console.log,
    
      // If plain is true, then sequelize will only return the first
      // record of the result set. In case of false it will return all records.
      plain: false,
    
      // Set this to true if you don't have a model definition for your query.
      raw: false,

      nest: true,
    
      // The type of query you are executing. The query type affects how results are formatted before they are passed back.
      type: PredictionRun.sequelize.QueryTypes.SELECT
    });

    console.log(JSON.stringify(predictionrun));


    rawQuery = `SELECT "Webcam"."webcamid", "Webcam"."imgurlmedres", "Webcam"."title", "Webcam"."location", "Webcam"."city", "Webcam"."countrycode", "Predictions"."confidence" AS "Predictions.confidence", "Predictions"."imgurl" AS "Predictions.imgurl", "PredictionModelLabels"."tfindex" AS "Predictions.tfindex", "Predictions"."createdat" AS "Predictions.createdat", "PredictionModelLabels"."name" AS "Predictions.name", "PredictionModelLabels"."icon" AS "Predictions.icon", "PredictionModelLabels"."cssclass" AS "Predictions.cssclass" FROM 
    "Webcams" as "Webcam"
    left join "Predictions" on "Predictions".fkpredictionrun = '111f74dd-a62b-40b1-aea5-61b7f4248547' and "Predictions".fkwebcam = "Webcam"."pkwebcam"
    left join "PredictionModelLabels" on "PredictionModelLabels"."pkpredictionmodellabel" = "Predictions"."fkpredictionmodellabel"
  WHERE (ST_Intersects("Webcam"."location", ST_SetSRID(ST_MakeBox2D(ST_Point(45.04635929200553, 4.257202148437501), ST_Point(48.60385760823255, 14.804077148437502)), 4326)) = true AND "Webcam"."lastupdate" IS NOT NULL) limit ${limit}`;

    webcams = await Webcam.sequelize.query(rawQuery, {
      // A function (or false) for logging your queries
      // Will get called for every SQL query that gets sent
      // to the server.
      logging: console.log,
    
      // If plain is true, then sequelize will only return the first
      // record of the result set. In case of false it will return all records.
      plain: false,
    
      // Set this to true if you don't have a model definition for your query.
      raw: false,

      nest: true,
    
      // The type of query you are executing. The query type affects how results are formatted before they are passed back.
      type: Webcam.sequelize.QueryTypes.SELECT
    });

    res.send(webcams);
  } catch(err) {
    console.error(err);
    next(err);
  }

});

/* GET webcam list. */
router.get('/', async function(req, res, next) {
  var webcams;
  var latestPredictionRun;
  var pkLatestPredictionRun;
  var limit;
  var age;
  var confidence;
  var bbox2d;
  var whereWebcams;
  var wherePredictions;
  var wherePredictionRuns;
  var wherePredictionModelLabel;
  var requestedPml;
  var wherePml;
  var isAllowedPml;
  var allowedPml = [ 'sunny', 'cloudy-rainy' ];

  try {

    // limit
    if (req.query.limit !== undefined) {
      if (isNaN(req.query.limit)) {
        throw new Error(`The submit limit value ${req.query.limit} is not a number.`);
      } else {
        limit = parseInt(req.query.limit);
      }
    } else {
      limit = 50;
    }

    // prediction age
    if (req.query.age !== undefined) {
      if (isNaN(req.query.age)) {
        throw new Error(`The submit age value ${req.query.age} is not a number.`);
      } else {
        age = parseInt(req.query.age);
      }
    } else {
      age = 18000; // 15min
    }

    // prediction confidence
    if (req.query.confidence !== undefined) {
      if (isNaN(req.query.confidence)) {
        throw new Error(`The submit confidence value ${req.query.confidence} is not a number.`);
      } else {
        confidence = parseFloat(req.query.confidence) / 100.0;
      }
    } else {
      confidence = 0.6; // confidence >= 60%
    }
    console.log(`Confidence set to: ${confidence}`);

    // prediction model labels (pml)
    if (req.query.pml !== undefined) {
      if (req.query.pml === '') {
        requestedPml = [];
      } else {
        requestedPml = req.query.pml.split(",");
        for (var i = 0; i < requestedPml.length; i++) {
          isAllowedPml = false;
          for (var t = 0; t < allowedPml.length; t++) {
            if (requestedPml[i] === allowedPml[t]) {
              isAllowedPml = true;
              break;
            }
          }
          if (!allowedPml) {
            throw new Error(`${requestedPml[i]} is not an allowed prediction model label to search for.`);
          }
        }
      }
    } else {
      requestedPml = allowedPml;
    }

    // map bounding box
    if (req.query.bounds != undefined) {
      bbox2d = getBBox2d(req.query.bounds);

      whereWebcams = {
        [Webcam.sequelize.Sequelize.Op.and]: [
          // bounding box
          Webcam.sequelize.where(
            Webcam.sequelize.fn('ST_Intersects', Webcam.sequelize.col('location'), 
                Webcam.sequelize.fn('ST_SetSRID',
                  Webcam.sequelize.fn('ST_MakeBox2D', Webcam.sequelize.fn('ST_Point', bbox2d.swllat, bbox2d.swlng), Webcam.sequelize.fn('ST_Point', bbox2d.nelat, bbox2d.nelng)),
                  4326 
                )
              ), true 
          ),
          {
            // lastupdate
            lastupdate: {
              [Webcam.sequelize.Sequelize.Op.not]: null
            }
          }
        ]
      }  
    } else {
      whereWebcams = {
        // lastupdate
        lastupdate: {
          [Webcam.sequelize.Sequelize.Op.not]: null
        }
      };
    }
    
    wherePredictionRuns = PredictionRun.sequelize.where(
      PredictionRun.sequelize.fn('EXTRACT',
      PredictionRun.sequelize.literal('EPOCH from (LOCALTIMESTAMP - "createdat")')
      ), { [PredictionRun.sequelize.Sequelize.Op.lt]: age });

    /* */
    latestPredictionRun = await PredictionRun.findOne({
      limit: 1,
      where: wherePredictionRuns,
      order:  [ [ PredictionRun.sequelize.col('createdat'), 'DESC' ] ]
    })
    
 
    /* for development return the first found prediction run 
    latestPredictionRun = await PredictionRun.findOne({
      limit: 1,
      order:  [ [ PredictionRun.sequelize.col('createdat'), 'DESC' ] ]
    })
    */
    
    if (requestedPml.length > 0) {
      wherePml = [];
      for (var q = 0; q < requestedPml.length; q++) {
        wherePml.push({name: requestedPml[q] });
      }
      wherePredictionModelLabel = {
        [PredictionModelLabel.sequelize.Sequelize.Op.or]: wherePml
      }
    } else {
      wherePredictionModelLabel = {};
    }

    wherePredictions = {
      confidence: {
        [Prediction.sequelize.Sequelize.Op.gte]: parseFloat(confidence)
      }
    }

    // there is a prediction run and predictions with a certain label are requested
    if ((latestPredictionRun != null) && (requestedPml.length > 0)) {
      pkLatestPredictionRun = latestPredictionRun.pkpredictionrun;

      webcams = await Webcam.findAll({
        limit: limit,
        include: { 
          model: Prediction,
          include: [
            { model: PredictionModelLabel,
              where: wherePredictionModelLabel 
            },
            { 
              model: PredictionRun,
              where: { pkpredictionrun: pkLatestPredictionRun },
              separate: false
            } 
          ],
        },
        where: whereWebcams,
        order: Webcam.sequelize.random()
      });
    } else {
      webcams = await Webcam.findAll({
        limit: limit,
        where: whereWebcams,
        order: Webcam.sequelize.random()
      });
    }

    res.send(webcams);
  } catch(err) {
    console.error(err);
    next(err);
  }
});

function getBBox2d(bounds) {
  // bounds is in Leaflet format: 'southwest_lng,southwest_lat,northeast_lng,northeast_lat'
  var bounds = bounds.split(',');
  var bbox2d = {
    swlng: parseFloat(bounds[0]),
    swllat: parseFloat(bounds[1]),
    nelng: parseFloat(bounds[2]),
    nelat: parseFloat(bounds[3]),
  }
  return bbox2d;
}

async function loadPredictionsForWebcams(webcams) {
  var predictions;
  var prediction;
  var webcam;
  try 
  {
    predictions = await dbprediction.getAll();
    if (predictions.length > 0) {
      for (var t = 0; t < webcams.length; t++) {
        webcam = webcams[t];
        for (var i = 0; i < predictions.length; i++) {
          prediction = predictions[i];
          if (prediction.fkwebcam === webcam.ID) {
            if (webcam.predictions === undefined) {
              webcam.predictions = [];
            }
            webcam.predictions.push(prediction);
          }
        }
      }
    }
  } catch(err) {
    res.send('Error during predictions.getAll: ' + err);
  }
  return webcams;
}

/* GET webcam download page. */
router.get('/download', function(req, res, next) {
  var webcamid = req.query.webcamid;
  if (webcamid === undefined) {
    webcamid = '';
  }
  
  var datetimeto = getLocalDateTimeNowString();
  res.render('webcam', { title: 'Download webcam images', downloadurl: './download', webcamid: webcamid, datetimeto: datetimeto });
});

function getLocalDateTimeNowString() {
  var datetimenow = new Date();
  var month = datetimenow.getMonth() + 1;
  if (month < 10) {
    month = '0' + month;
  }

  var day = datetimenow.getDate();
  if (day < 10) {
    day = '0' + day;
  }
  
  var dateTimeNowString = datetimenow.getFullYear() + '-' + month + '-'+ day + 'T' + datetimenow.toLocaleTimeString();
  return dateTimeNowString;
}

/* POST download images from webcam */
router.post('/download', function(req, res, next) {

  const datetimefrom = req.body.datetimefrom;
  const datetimeto = req.body.datetimeto;
  const timeinterval = req.body.timeinterval;
  const webcamurl = req.body.webcamurl;
  const webcamid = req.body.webcamid;

  if (datetimefrom !== '' && datetimeto != '' && webcamurl !== '') {
    var dateTimeFrom = new Date(datetimefrom);
    var dateTimeTo = new Date(datetimeto);
    var timeInterval = parseInt(timeinterval);
    var images = buildDownloadImages(webcamid, webcamurl, dateTimeFrom, dateTimeTo, timeInterval);
    if (images.length > 0) {
      for (var i = 0; i < images.length; i++) {
        downloadImage(images[i], `./downloads/${webcamid}/`);
      }
    }

    res.send(images);
  } else {
    res.send('Not all fields are set! Check datetimeFrom, datetimeTo and webcamurl.');
  }
});

/* GET webcam map page. */
router.get('/map', function(req, res, next) {
  res.render('webcammap', { title: '☀︎ SunSpotter' });
});

/* GET webcam map page. */
router.get('/windy', function(req, res, next) {
  res.render('webcam-windy', { title: 'Download webcam images from Windy.com', downloadurl: './search-windy' });
});

/* init webcam database */
router.get('/init', async function(req, res, next) {
  var webcamlist;
  try 
  {
    await dbprediction.drop();
    await dbwebcam.init();

    webcamlist = await getWebcamListFromFotoWebcamEu();
    for (var i = 0; i < webcamlist.length; i++) {
      await dbwebcam.insert(i, webcamlist[i].webcamid, webcamlist[i].title, 0.0, 0.0, webcamlist[i].imgurl);
    }

    res.send(webcamlist);
  } catch(err) {
    var errMsg = `Error during initializing webcan database: ` + err;
    console.error(errMsg);
    res.send({ error: errMsg });
  }
});

/* init webcam database */
router.get('/geocode', async function(req, res, next) {
  var webcams;
  var webcamObj;
  var latlong;
  var useGeocodeService;

  useGeocodeService = (req.query.useGeocodeService.toLowerCase() === 'true');

  try {
    webcams = await dbwebcam.getAllWhereTitleIsSetAndNotGeocoded();
    for(var i = 0; i < webcams.length; i++) {
      webcamObj = webcams[i];
      console.log("Get LatLong for webcam:", webcamObj.ID, webcamObj.title);
      
      if (useGeocodeService) {
        latlong = await getWebcamLatLong(webcamObj.title, webcamObj.webcamid); 
      } else {
        latlong = await getWebcamLatLongFromCache(webcamObj.title, webcamObj.webcamid);
        if (latlong === null) {
          latlong = await getWebcamLatLong(webcamObj.title, webcamObj.webcamid); 
        }
      }
      
      if (latlong != null) {
        await dbwebcam.updateLatLong(webcamObj.ID, latlong.lat, latlong.long);
      } 
    }
    webcams = await dbwebcam.getAll();
    await loadPredictionsForWebcams(webcams);
    res.send(webcams);
  } catch(err) {
    var errMsg = `Error during geocode webcam positions: ` + err;
    console.error(errMsg);
    res.send({ error: errMsg });
  }
});

/* init webcam database */
router.get('/predictall', async function(req, res, next) {
  var predictscript;
  var python;
  var predictscriptoutput;

  try {
    // call external python predict script
    predictscript = './predict/predict.py';
    python = spawnSync('python3', [predictscript], { stdio: 'inherit' });
    if (python.status > 0) {
      throw new Error(`Calling ${predictscript} failed with status: ${python.status}`);
    }
    
    predictscriptoutput = uint8ArrayToString(python.stdout);
    console.log(predictscriptoutput);

    webcams = await dbwebcam.getAll();
    await loadPredictionsForWebcams(webcams);
    res.send(webcams);

  } catch(err) {
    var errMsg = `Error during predict webcams: ` + err;
    console.error(errMsg);
    res.send({ error: errMsg });
  }
});

function uint8ArraysToString(uint8arrays)
{
  var uint8array;
  var string = "";
  var textDecoder = new TextDecoder();

  for (var i = 0; i < uint8arrays.length; i++) {
    uint8array = uint8arrays[i];
    if (uint8array !== null) {
      string += textDecoder.decode(uint8array);
    }
  }
  return string;
}

function uint8ArrayToString(uint8array)
{
  var string = "";
  var textDecoder = new TextDecoder();
  if (uint8array !== null) {
    string = textDecoder.decode(uint8array);
  }
  return string;
}

/* get webcam list either from cache or scrape directly from website */
router.get('/list', async function(req, res, next) {
  var webcamlist;
  const fromcache = req.fromcache;
  
  if (fromcache !== undefined && fromcache !== '') {
    webcamlist = await getWebcamListFromCache();
  } else {
    webcamlist = await getWebcamListFromFotoWebcamEu();
  }
  res.send(webcamlist);
});

async function getWebcamLatLong(title, webcamid) {
  var point = null;
  var urlencodedTitle = encodeURIComponent(title);
  var apikey = '5b3ce3597851110001cf62481cd8cf137a244c0da87f7abaab6cfc9f';
  var boundingboxCentralEurope = '&boundary.rect.min_lat=4.59&boundary.rect.min_lon=44.16&boundary.rect.max_lat=18.66&boundary.rect.max_lon=50.16'

  var urlWithBB = `https://api.openrouteservice.org/geocode/search?api_key=${apikey}&text=${urlencodedTitle}&size=1${boundingboxCentralEurope}`;
  var url = `https://api.openrouteservice.org/geocode/search?api_key=${apikey}&text=${urlencodedTitle}&size=1`;
  var filename;
  var jsonObjAsString;

  try {
    // geocode the webcam position
    var fetchOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
      }
    }
    const response = await fetch(url, fetchOptions);
    // get json response
    const jsonObj = await response.json();

    if (jsonObj.error === undefined) {
      // response from gecode service doesn't contain an error
      try {
        jsonObjAsString = JSON.stringify(jsonObj);
        filename = `./geocode-cache/${webcamid}.json`;
        fs.writeFileSync(filename, jsonObjAsString);
        console.log(`Gecode response saved for webcam: ${webcamid} in ${filename}`);
      } catch (err) {
          console.error(err);
      }
  
      // try to get the point
      point = getPoint(jsonObj);
    } 
  } catch(err) {
    console.error(err);
  }
  return point;
}

async function getWebcamLatLongFromCache(title, webcamid) {
  var point = null;
  var jsonObj;
  var filename;
  var jsonAsString;

  try {
    filename = `./geocode-cache/${webcamid}.json`;
    jsonAsString = fs.readFileSync(filename, { encoding: 'utf-8' });
    jsonObj = JSON.parse(jsonAsString);
    console.log(`Read LatLong for webcam: ${webcamid} from cache ${filename}`);
    // try to get the point
    point = getPoint(jsonObj);
  } catch(err) {
    console.error(err);
  }
  return point;
}

function getPoint(jsonObj) {
  var firstFeature;
  var point = null;
  if (jsonObj.features !== undefined && jsonObj.features.length > 0) {
    firstFeature = jsonObj.features[0];
    if (firstFeature.geometry !== undefined && firstFeature.geometry.type === 'Point') {
      point = { lat: firstFeature.geometry.coordinates[0], long: firstFeature.geometry.coordinates[1] };
    }
  }
  return point;
}

function buildDownloadImages(webcamid, urlTemplate, dateTimeFrom, dateTimeTo, timeInterval) {
  var images = [];
  var url;
  var dateTime = dateTimeFrom;

  do {
    image = buildWebcamImage(webcamid, urlTemplate, dateTime);
    dateTime.setHours(dateTime.getHours() + timeInterval);
    images.push(image);
  } while (dateTime < dateTimeTo);
  return images;
}

function buildWebcamImage(webcamid, urlTemplate, dateTime) {
  /* e.g. 
    https://www.foto-webcam.eu/webcam/innsbruck-uni-west/2020/12/30/1200_la.jpg
    https://www.foto-webcam.eu/webcam/%webcamid/%YYYY/%mm/%dd/%HH%MM_la.jpg
  */ 
  var fullYear = dateTime.getFullYear();
  var month = dateTime.getMonth(); // month starts at 0
  month ++;
  var day = dateTime.getDate();
  var hours = dateTime.getHours();
  var minutes = dateTime.getMinutes();
  var seconds = dateTime.getSeconds();

  var url = urlTemplate;
  url = url.replace('%YYYY', fullYear);
  if (month < 10) {
    month = '0' + month;
  }
  url = url.replace('%mm', month);
  if (day < 10) {
    day = '0' + day;
  }
  url = url.replace('%dd', day);
  if (hours < 10) {
    hours = '0' + hours;
  }
  url = url.replace('%HH', hours);
  if (minutes < 10) {
    minutes = '0' + minutes;
  }
  url = url.replace('%MM', minutes);
  if (seconds < 10) {
    seconds = '0' + seconds;
  }
  url = url.replace('%ss', seconds);
  url = url.replace('%webcamid', webcamid);

  filename = webcamid + '-' + fullYear + '-' + month + '-' + day + '_' + hours + '-' + minutes + '-' + seconds;
  filename = filename + '.' + url.substr(url.lastIndexOf('.') + 1);
  return { url: url, filename: filename };
}

function buildWebcamImageUrl(webcamid, urlTemplate)
{
  /* e.g. 
    https://www.foto-webcam.eu/webcam/innsbruck-uni-west/current/180.jpg
    https://www.foto-webcam.eu/webcam/%webcamid/%YYYY/%mm/%dd/%HH%MM_la.jpg
  */ 
  var url = urlTemplate.replace('%webcamid', webcamid);
  return url;
}

function buildWebcamTitle(title) {
  var newTitle;
  const posDash = title.indexOf('-');
  if (posDash > 0) {
    newTitle = title.substr(0, posDash);
  } else {
    newTitle = title;
  }
  newTitle = newTitle.trim();
  return newTitle;
}

function buildWebcamId(webcamIdWithUrl) {
  var webcamid;
  
  console.log(`webcamidwithurl: ${webcamIdWithUrl}`);

  webcamid = webcamIdWithUrl.replace('webcam', '');
  webcamid = webcamid.replace(/\//g, '');

  console.log(`replaced webcamid: ${webcamIdWithUrl}`);

  return webcamid;
}

async function downloadImage(image, pathToSave) {
  const response = await fetch(image.url);
  const buffer = await response.buffer();
  const dirExists = fs.existsSync(pathToSave);
  var filename;
  try {

    if (!dirExists) {
      await makefolder(pathToSave);
    }
    filename = `${pathToSave}${image.filename}`;
    fs.writeFileSync(filename, buffer);
  } 
  catch(err)
  {
    console.error(err);
    filename = "";
  }
  return filename;
}

function makefolder (folder) {
  return new Promise(function (resolve, reject) {
   fs.mkdir(folder, function (err) {
    if (err) return reject(err)
    resolve()
   })
  })
 }

async function getWebcamListFromFotoWebcamEu(webcamlisturl, cssClassname) {
  var webcamlist = [];
  var webcam;
  var imgurl;
  var webcamlisturl = 'https://www.foto-webcam.eu';
  var imgurlTempl = 'https://www.foto-webcam.eu/webcam/%webcamid/current/180.jpg';
  var cssClassnameOfWecamElem = '.wcov';
  var now = new Date();

  try {
    // get the website
    const response = await fetch(webcamlisturl);
    // get the html content
    const htmlString = await response.text();
    // instantiate DOM parser
    const { document } = (new JSDOM(htmlString)).window;
    const arrOfElems = document.querySelectorAll(cssClassnameOfWecamElem);
    for (var i = 0; i < arrOfElems.length; i++) {
      webcamEl = arrOfElems[i]; 
      title = buildWebcamTitle(webcamEl.title);
      webcamid = buildWebcamId(webcamEl.href);
      imgurl = buildWebcamImageUrl(webcamid, imgurlTempl);
      webcam = { title: title, webcamid: webcamid, imgurl: imgurl };
      webcamlist.push(webcam);
    }
  } catch(err) {
    console.error(err);
  }
  return webcamlist;
}

async function getWebcamListFromCache() {
  return [];
}



export default router;