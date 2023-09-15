import fs from 'node:fs';
import { once } from 'node:events';
import https from 'node:https';
import minimist from 'minimist';
import { format, parse, eachDayOfInterval, subDays } from 'date-fns';
import parseKMZ from 'parse2-kmz';


const REPO_LIST_URL = "https://api.github.com/repos/owlmaps/UAControlMapBackups/contents/";
const TMP_FILE = 'data/tmp.kmz';
const FRONTLINE_START_DATE = '230825';
const FRONTLINEKEY = "Frontline";
const DATA_FILE = 'data/frontline.json';

const update = async () => {}

const build = async () => {
  // first day of frontline data
  const startDateKey = FRONTLINE_START_DATE; // yymmdd
  // current day
  const currentDay = new Date();
  const currentDateKey = format(currentDay, 'yyMMdd');
  // set range & interval
  const rangeStart = parse(startDateKey, 'yyMMdd', new Date());
  const rangeEnd = parse(currentDateKey, 'yyMMdd', new Date());
  const interval = eachDayOfInterval({
    start: rangeStart,
    end: rangeEnd
  });

  // get repo listing
  const repoFiles = await getRepoListing();
  // console.log(repoFiles);

  const frontlineAll = [];

  // loop through each day
  for (const intervalDay of interval) {

    // dateKey for loop day
    const dateKey = format(intervalDay, 'yyMMdd', new Date());
    console.log(`Fetching data for ${dateKey}`);

    // find corresponding kmz file in the repo listing
    const repoFileData = getRepoFileData(repoFiles, dateKey);
    // console.log(repoFileData);
    const data = await fetchData(repoFileData);
    console.log(data.features.length);

    // extract frontline data
    const frontlineData = extractFrontlinedata(data);
    frontlineAll.push({
      dateKey,
      data: frontlineData
    });
  
  }  

  saveData(frontlineAll);

}


const saveData = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  } catch (error) {
    throw Error(error);
  }
}

const getRepoListing = async () => {
  try {
    const response = await fetch(REPO_LIST_URL);
    const listing = await response.json();
    return listing;
  } catch (error) {
    console.log('not found');
    throw Error(error);
  }   
}

const getRepoFileData = (repoFiles, dateKey) => {
  let repoFileData = null;
  for (let i = 0; i < repoFiles.length; i++) {
    const repoFile = repoFiles[i];
    if (repoFile.name.startsWith(`${dateKey}_`)) {
      repoFileData = repoFile;
      break;
    }  
  }
  return repoFileData;
}

const fetchData = async (repoFileData) => {

  const url = repoFileData.download_url;

  // fetch the kmz, write to tmp file
  await fetchKMZ(url);

  // parse kmz
  const json = await kmz2json();

  // cleanup
  cleanup();

  // return
  return json;
}

const fetchKMZ = async (url) => {  
  return await new Promise((resolve, reject) => {
    https.get(url, response => {
      const code = response.statusCode ?? 0

      if (code >= 400) {
        return reject(new Error(response.statusMessage))
      }

      // handle redirects
      if (code > 300 && code < 400 && !!response.headers.location) {
        return resolve(
          downloadFile(response.headers.location, TMP_FILE)
        )
      }

      // save the file to disk
      const fileWriter = fs
        .createWriteStream(TMP_FILE)
        .on('finish', () => {
          resolve({})
        })

      response.pipe(fileWriter)
    }).on('error', error => {
      reject(error)
    })
  })
}

const kmz2json = async () => {
  try {
    const data = await parseKMZ.toJson(TMP_FILE);
    return data;
  } catch (error) {
    cleanup();
    // throw Error(error);
    return {}
  }
}

const cleanup = () => {
  try {
    if (fs.existsSync(TMP_FILE)) {
      fs.unlinkSync(TMP_FILE);
    }
  } catch (error) {
    throw Error(error);
  }
}

const extractFrontlinedata = (data) => {
  const frontline = [];

  const { features } = data;

  if (!features || !Array.isArray(features)) {
    return frontline;
  }

  // loop over each feature
  features.forEach((feature) => {
  
    const { properties } = feature;
    const { name } = properties;

    if (!name) {
      return;
    }

    const fixedName = name.replace(/(\r\n|\n|\r)/gm, '').replace(/\s+/g," ");

    // save Frontline
    if (FRONTLINEKEY == fixedName) {
      feature.properties = { name };
      frontline.push(feature);
      return;
    }

  });

  return frontline;


}



(async () => {
  // parse args
  const args = minimist(process.argv.slice(2));

  switch (args.action) {
    case 'update':
      await update();
      break;
    case 'build':
      await build()
      break;  
    default:
      break;
  }

})()