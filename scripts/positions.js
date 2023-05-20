import fs from 'node:fs';
import { once } from 'node:events';
import fetch from 'node-fetch';
import got from 'got';
import parseKMZ from 'parse2-kmz';
import { centroid } from '@turf/turf';


// constants
const TMP_FILE = 'data/latest.kmz';
const TARGET = 'data/latestposition.json';

const WANTEDAREAS = [
  'Luhansk Axis [Z]',
  'Donetsk Axis [Z]',
  'Crimean Axis [Z]',
  'Zaporizhia and Kherson Axis [Z]',
  'Pre-War Crimea',
  'Crimea',
];


export const getLatest = async () => {
  let attempts = 0;
  while (true) {
    attempts += 1;
    if (attempts > 10) {
      console.log(`max # of attempts - exit`);
      break;
    }    
    console.log(`attempt #${attempts} to fetch data`);
    await fetchLatestKMZ();
    if (fs.existsSync(TMP_FILE)) {
      console.log(`${TMP_FILE} exists, continue`);
      break;
    }
  }
}

export const fetchLatestKMZ = async () => {
  try {
    const stream = fs.createWriteStream(TMP_FILE);
    const url = "https://www.google.com/maps/d/u/0/kml?mid=180u1IkUjtjpdJWnIC0AxTKSiqK4G6Pez";
    const response = await fetch(url);
		//console.log(response.headers)
    response.body.pipe(stream);
    await once(stream, 'finish');
  } catch (error) {
    cleanup();
    throw Error(error);
  }
}
export const fetchLatestKMZ2 = async () => {
  try {
    const write = fs.createWriteStream(TMP_FILE);
    const url = "https://www.google.com/maps/d/u/0/kml?mid=180u1IkUjtjpdJWnIC0AxTKSiqK4G6Pez";
    const stream = got.stream(url);
    stream.pipe(write);
    await once(write, 'finish');
  } catch (error) {
    cleanup();
    throw Error(error);
  }
}
export const fetchLatestKMZ3 = async () => {
  try {
    const url = "https://www.google.com/maps/d/u/0/kml?mid=180u1IkUjtjpdJWnIC0AxTKSiqK4G6Pez";
    const response = await got.get(url).buffer();
    fs.writeFileSync(TMP_FILE, response);
  } catch (error) {
    cleanup();
    throw Error(error);
  }
}

export const kmz2json = async () => {
  console.log('kmz2json')
  try {
    if (fs.existsSync(TMP_FILE)) {
      const { ext, mime } = await fileTypeFromFile(TMP_FILE);
      if (ext === 'zip' && mime === 'application/zip') {
        return await parseKMZ.toJson(TMP_FILE);
      } else {
        throw Error('wrong ext or mime', ext, mime);
      }
    } else {
      throw Error('tmp file does not exist');
    }
  } catch (error) {
    // cleanup();
    throw Error(error);
  }
}

export const cleanup = () => {
  try {
    if (fs.existsSync(TMP_FILE)) {
      fs.unlinkSync(TMP_FILE);
    }
  } catch (error) {
    throw Error(error);
  }
}

export const generatePositionData = (json) => {
  // init data
  const featureList = [];
  const frontline = [];
  // name pattern: "[yy/mm/dd] Ua|Ru Position"
  const pattern = /\[(\d+)\/(\d+)\/(\d+)\]\s*?(?:(Ru|Ua))\s*?Position/;
  // get features or return empty result
  const { features } = json;
  if (!features || !Array.isArray(features)) {
    return featureList;
  }
  // loop over each feature
  features.forEach((feature) => {
  
    const { properties, geometry } = feature;
    const { name, description } = properties;
    const { type, coordinates } = geometry;

    // check for important areas
    const fixedName = name.replace(/(\r\n|\n|\r)/gm, '').replace(/\s+/g," ");
    if (WANTEDAREAS.includes(fixedName)) {
      // remove all styles from the feature, we will style
      // it on the frontend
      feature.properties = { name }; // write the name back
      frontline.push(feature);
      // we can skip this feature now
      return;
    }


    // skip all non-polygon features
    if (type !== "Polygon") {
      return;
    }

    // check for postion pattern in name property
    const match = name.match(pattern);

    if (match && match.length > 0) {
      // who = ua|ru
      const who = match[4].toLowerCase();
      // date foo
      const day = match[1];
      const month = match[2];
      const year = match[3];
      const dateKey = `${year}${month}${day}`;
      const dateStr = `20${year}-${month}-${day}`;
      const date = new Date(dateStr);
      const unixTimestamp = Math.floor(date.getTime() / 1000);
      // converts feature from polygon to point (centroid)
      // looses all properties from the original
      const feat = centroid(geometry);
      // add old properties to converted feature
      feat.properties.name = properties.name;
      feat.properties.description = properties.description;
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
    frontline: frontline
  }

}

const saveData = (data) => {
  try {
    fs.writeFileSync(TARGET, JSON.stringify(data));
  } catch (error) {
    throw Error(error);
  }
}




(async () => {
  // await getLatest();
  await fetchLatestKMZ3();
  const json = await kmz2json();
  cleanup(); // final cleanup
  const data = generatePositionData(json);
  // console.log(`Write Data to ${TARGET} - got ${data.features.length} features`)
  saveData(data);
})()
