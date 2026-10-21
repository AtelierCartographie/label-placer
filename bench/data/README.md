# Benchmark data

`communes-2018.json.gz`: the 34,734 communes of metropolitan France as `[name, region code, births in 2018, x, y]`, with `x, y` in Lambert-93 (EPSG:2154) metres.

- Births: INSEE, *Naissances par commune* 2018, Licence Ouverte.
- Points: commune representative points from IGN Admin Express 2026, through the Khartis basemap catalogue, Licence Ouverte.

`world-countries.geojson.gz`: country outlines at 1:110m (Natural Earth, public domain, through the world.geo.json compilation used by Khartis' examples).

`world-population-2023.csv`: population by country in 2023, World Bank (World Development Indicators, CC BY 4.0).

`scripts/demo-data.ts` turns these, and the communes of Normandie, into the other zones of `docs/comment-ca-marche.html`.
