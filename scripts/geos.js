import fs from 'node:fs';
import {pipeline} from 'node:stream';
import {promisify} from 'node:util'
import fetch from 'node-fetch';
import parseKMZ from 'parse2-kmz';
import { centroid } from '@turf/turf';



// constants
const NUM_ATTEMPTS = 30;
const KMZ_URL = 'https://www.google.com/maps/d/kml?mid=180u1IkUjtjpdJWnIC0AxTKSiqK4G6Pez';
const TMP_FILE = 'data/latest.kmz';
const TARGET = 'data/latestposition.json';

// Frontline & Fortification Keys
const FRONTLINEKEY = "Frontline";
const FORTIFICATIONKEY = "Fortifications";






export const generateGeosData = (json) => {

  // init data
  const featureList = [];
  const frontline = [];
  const fortifications = [];

  // name pattern: "[yy/mm/dd] Ua|Ru Position" - needed for old geos
  const pattern = /\[(\d+)\/(\d+)\/(\d+)\]\s*?(?:(Ru|Ua))\s*?Position/;

  // get features or return empty result
  const { features } = json;
  if (!features || !Array.isArray(features)) {
    return featureList;
  }

  // loop over each feature
  features.forEach((feature) => {
  
    const { properties, geometry } = feature;
    const { name, description, code } = properties;
    const { type, coordinates } = geometry;
		
		// skip all without a name (fortifiction layer most likely)
		if (!name) {
			return;
		}

    // get the name of the layer, fix line breaks ect.
    const fixedName = name.replace(/(\r\n|\n|\r)/gm, '').replace(/\s+/g," ");

    // save Frontline
    if (FRONTLINEKEY == fixedName) {
      feature.properties = { name };
      frontline.push(feature);
      return;
    }

    // save Fortifications
    if (FORTIFICATIONKEY == fixedName) {
      feature.properties = { name };
      fortifications.push(feature);
      return;
    }

 
    // skip all non polygon/point features
    if (type !== "Polygon" && type !== "Point") {
      return;
    }

console.log(name)
    // check for postion pattern in name property
    const match = name.match(pattern);

    if (match && match.length > 0) {
      // who = ua|ru
      const who = match[4].toLowerCase();
      // date foo
      const day = code ? match[3] : match[1];
      const month = match[2];
      const year = code ? match[1] : match[3];
      const dateKey = `${year}${month}${day}`;
      const dateStr = `20${year}-${month}-${day}`;
      const date = new Date(dateStr);
      const unixTimestamp = Math.floor(date.getTime() / 1000);

      // if its an old geo with polys, calculate the centroid
      // and use that as the new point feature, else use the given geometry
      // Note: centroid() will remove all other props of that feature

      // init new features
      const feat = {
        "type": "Feature",
        "properties": {},
        "geometry": {}
      }

      // add geometry
      feat.geometry = type === 'Polygon' ? centroid(geometry).geometry : geometry;
      // remove the height form coordinates
      feat.geometry.coordinates[2] = 0;

      // extend the feature (we only have the geometry right now)
      feat.properties.name = properties.name;
      feat.properties.description = properties.description;
      // console.log(feat.geometry.coordinates);
      feat.properties.location = `${feat.geometry.coordinates[0]}, ${feat.geometry.coordinates[1]}`;

      // add event times used later in the leaflet timeline module
      // end will be overwritten later, default is: +1 day
      feat.properties.start = unixTimestamp;
      feat.properties.end = unixTimestamp + (1 * 86400);

      // add is this event accociated to
      feat.properties.side = who;

      // finally add the new feature to the list
      featureList.push(feat);
    }
  });

  // we need a feature collection
  const finalCollection = {
    "type": "FeatureCollection",
    "features": featureList
  }

  return {
    positions: finalCollection,
    frontline: frontline,
    fortifications: fortifications
  }

}

const saveData = (data) => {
  try {
    fs.writeFileSync(TARGET, JSON.stringify(data));
  } catch (error) {
    throw Error(error);
  }
}


const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

export const cleanup = () => {
  try {
    if (fs.existsSync(TMP_FILE)) {
      fs.unlinkSync(TMP_FILE);
    }
  } catch (error) {
    throw Error(error);
  }
}

const downloadLatest = async () => {

  let isError = false;

  for (let i = 1; i <= NUM_ATTEMPTS; i++) {
    console.log(`download attempts #${i}`);

    try {
      const streamPipeline = promisify(pipeline);
      const response = await fetch(KMZ_URL);
      if (response.ok) {
        await streamPipeline(response.body, fs.createWriteStream(TMP_FILE));
        isError = false;
      } else {
        console.log('response not ok', response.status);
        // console.log(response.headers)
        isError = true;
      }   
      
    } catch (error) {
      console.log(error);
      isError = true;
    } finally {
      // console.log('finally');
      if (!isError || i === NUM_ATTEMPTS) {
        break;
      }
    }

    // wait before next attempt
    console.log('wait 30s before next attempt')
    await sleep(30000); // 30s
  }

}

const kmz2json = async () => {
  try {
    if (!fs.existsSync(TMP_FILE)) {
      return { json: null, error: true }
    }
    const json = await parseKMZ.toJson(TMP_FILE);
    return { json, error: false }
  } catch (error) {
    console.log(error);
    return { json: null, error: true }
  }
}



(async () => {
  // download latest kmz
  await downloadLatest();
  // console.log('download done...');
  const {json, error} = await kmz2json();
  console.log('kmz->json done...');
  if (error ||json === null) {
    return;
  }
  cleanup(); // remove tmp file
  const data = generateGeosData(json);
  // console.log(data)
  // console.log(`Write Data to ${TARGET} - got ${data.positions.features.length} features`)
  saveData(data);
})()
