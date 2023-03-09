# timeline-data

Repository to store different data files, auto-generated on a scheduled basis.

## data directory

`latestpositions.json`

Stores all "event" locations (ua/ru positions) with their meta data and *Point* geometries, incl. the latest frontline layer.

`frontline.json`

Stores all frontline layers since mid December (since we have backups).

## scripts

`generate:positions`

Downloads the latest map .kmz, filters all relevant features and converts their *Polygon* geometries to *Centroids* (*Points*). Also extracts the (latest) frontline layers.

`generate:frontline_new`

Tries do downloads the backup .kmz for the current day and updates todays frontline.

`generate:frontline_rebuild`

Used locally to rebuild the whole data file.

## Workflows

`update_positions`

Workflow that runs the `generate:positions` script on a scheduled basis (every 15minutes) and commits the generated .json file if there are any changes.

`update_frontline`

Workflow that runs the `generate:frontline_new` script on a scheduled basis (every hour) and commits the generated .json file if there are any changes.

## Notes

Still some date issues with filenames in the backup.
