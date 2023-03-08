import path from 'node:path';
import fs from 'node:fs';
import { once } from 'node:events';
import minimist from 'minimist'
import fetch from 'node-fetch';
import { format, parse, eachDayOfInterval, subDays } from 'date-fns';
import parseKMZ from 'parse2-kmz';

// constants
const startDateKey = '221209'; // yymmdd
const TMP_FILE = 'data/tmp.kmz';
const DATA_FILE = 'data/frontline.json';
const OWLMAP_BACKUP_REPO_URL = 'https://raw.githubusercontent.com/owlmaps/UAControlMapBackups/master/';

const WANTEDAREAS = [
  'Luhansk Axis [Z]',
  'Donetsk Axis [Z]',
  'Crimean Axis [Z]',
  'Pre-War Crimea',
  'Crimea',
];


const generateKmzUrl = (dateKey) => {
  return path.join(OWLMAP_BACKUP_REPO_URL, `${dateKey}_0000.kmz`);
}

export const fetchKMZ = async (url) => {
  try {
    const response = await fetch(url);
    if (response.status === 404) {
      console.log(`404 fetch error - ${url}`);
      return false;
    }
    const stream = fs.createWriteStream(TMP_FILE);
    response.body.pipe(stream);
    await once(stream, 'finish');
  } catch (error) {
    console.log('not found');
    throw Error(error);
  }
  return true;
}

export const kmz2json = async () => {
  try {
    return await parseKMZ.toJson(TMP_FILE);
  } catch (error) {
    cleanup();
    throw Error(error);
  }
}

export const getCurrentData = async () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE);
      return await JSON.parse(data);
    } else {
      return Promise.resolve({});
    }
  } catch (error) {
    throw Error(error);
  }
}

const saveData = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  } catch (error) {
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

export const generateData = (json) => {
  // init data
  const frontline = [];
  // get features or return empty result
  const { features } = json;
  if (!features || !Array.isArray(features)) {
    return featureList;
  }
  // loop over each feature
  features.forEach((feature) => {
  
    const { properties } = feature;
    const { name } = properties;

    if (!name) {
      return;
    }

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
  });
  // return data
  return frontline;
}

const getData = async (dateKey) => {

  // generate fetch url
  const fetchUrl = generateKmzUrl(dateKey);

  // fetch the kmz, write to tmp file
  const wasSuccess = await fetchKMZ(fetchUrl);

  // success check
  if (!wasSuccess) {
    console.log('no data available');
    return Promise.resolve();
  }

  // parse kmz
  const json = await kmz2json();

  // cleanup
  cleanup();

  // generate data
  const data = generateData(json);

  // return
  return data;
}


const get_new = async () => {

  // generate the date key (we need yesterdays day here)
  const currentDay = new Date();
  const yesterday = subDays(currentDay, 1);
  const currentDateKey = format(yesterday, 'yyMMdd');
  // const currentDateKey = '230117';

  // get data
  const data = await getData(currentDateKey);

  // get old data
  const currentData = await getCurrentData();

  // overwrite/add data for dateKey
  currentData[currentDateKey] = data;

  // save data
  saveData(currentData);
}


const rebuild = async () => {
  // rebuild all by fetching data for
  // each day from the archive-repo

  // get old data
  const currentData = await getCurrentData();

  // define start-end
  const currentDay = new Date();
  const yesterday = subDays(currentDay, 1);
  const currentDateKey = format(yesterday, 'yyMMdd');
  const rangeStart = parse(startDateKey, 'yyMMdd', new Date());
  const rangeEnd = parse(currentDateKey, 'yyMMdd', new Date());
  const interval = eachDayOfInterval({
    start: rangeStart,
    end: rangeEnd
  });
  for (const intervalDay of interval) {
    const dateKey = format(intervalDay, 'yyMMdd', new Date());

    // get data
    const data = await getData(dateKey);

    // overwrite/add data for dateKey
    currentData[currentDateKey] = data;
    
  }

  // save data
  saveData(currentData);

}


(async () => {
  // parse args
  const args = minimist(process.argv.slice(2));
  // depending on the action we run different code
  switch (args.action) {
    case 'new':
      await get_new();
      break;
    case 'rebuild':
      await rebuild()
      break;  
    default:
      break;
  }
})()