# timeline-data

Repository to store different data files, auto-generated on a scheduled basis.

## data directory

`latestpositions.json`

Stores all "event" locations (ua/ru positions) with their meta data and *Point* geometries.

## scsripts

`positions`

Downloads the latest map .kmz, filters all relevant features and converts their *Polygon* geometries to *Centroids* (*Points*).

## Workflows

`update`

Workflow that runs the *positions* script on a scheduled basis (every 15minutes) and commits the generated .json file if there are any changes.

## TODO

A similar approach is planned for the frontline data. Here we need an incremential approach as we initially need every .kmz since december.
