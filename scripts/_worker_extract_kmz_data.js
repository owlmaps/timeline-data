import path from 'node:path';
import { kmz2json, parseFrontlineData } from './_helper.js';

export default async (kmzFilePath) => {
  const kmzFileName = path.basename(kmzFilePath);
  const dateKey = kmzFileName.split('_')[0];
  console.log(`parse ${dateKey}`);
  const json = await kmz2json(kmzFilePath);
  const data = parseFrontlineData(json, dateKey);
  return data;
}





