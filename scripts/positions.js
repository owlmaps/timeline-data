import fs from 'node:fs';
import { once } from 'node:events';

import fetch from 'node-fetch';
import parseKMZ from 'parse2-kmz';
import { centroid } from '@turf/turf';


// constants
const TMP_FILE = 'data/latest.kmz';
const TARGET = 'data/latestposition.json';

const WANTEDAREAS = [
  'Luhansk Axis [Z]',
  'Donetsk Axis [Z]',
  'Crimean Axis [Z]',
  'Pre-War Crimea',
  'Crimea',
];


export const fetchLatestKMZ = async () => {
  try {
    const stream = fs.createWriteStream(TMP_FILE);
    const url = "https://www.google.com/maps/d/u/0/kml?mid=180u1IkUjtjpdJWnIC0AxTKSiqK4G6Pez";
    const response = await fetch(url);
    response.body.pipe(stream);
    await once(stream, 'finish');
  } catch (error) {
    throw Error(error);
  }
}

export const kmz2json = async () => {
  try {
    return await parseKMZ.toJson(TMP_FILE);
  } catch (error) {
    cleanup();
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
    frontline: null
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
  await fetchLatestKMZ();
  const json = await kmz2json();
  cleanup(); // final cleanup
  const data = generatePositionData(json);
  // console.log(`Write Data to ${TARGET} - got ${data.features.length} features`)
  saveData(data);
})()
