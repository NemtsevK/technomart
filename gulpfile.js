import { readFileSync, rmSync } from 'node:fs';
import gulp from 'gulp';
import plumber from 'gulp-plumber';
import sass from 'gulp-dart-sass';
import postcss from 'gulp-postcss';
import autoprefixer from 'autoprefixer';
import csso from 'postcss-csso';
import rename from 'gulp-rename';
import terser from 'gulp-terser';
import webp from 'gulp-webp';
import imagemin from 'gulp-imagemin';
import svgo from 'gulp-svgmin';
import browser from 'browser-sync';
import replace from 'gulp-replace';
import { stacksvg } from 'gulp-stacksvg';
import { nunjucksCompile } from 'gulp-nunjucks';

const { src, dest, watch, series, parallel } = gulp;

const SOURCE_ROOT = 'source';
const BUILD_ROOT = 'build';
const PATH_TO_MARKUP = `${SOURCE_ROOT}/**/*.html`;
const PATH_TO_TEMPLATES = `${SOURCE_ROOT}/templates/*.html`;
const PATH_TO_STYLE = `${SOURCE_ROOT}/sass/style.scss`;
const PATH_TO_STYLES = `${SOURCE_ROOT}/sass/**/*.scss`;
const PATH_TO_SCRIPTS = `${SOURCE_ROOT}/js/*.js`;
const PATH_TO_RASTER = `${SOURCE_ROOT}/images/**/*.{png,jpg}`;
const PATH_TO_SPRITES = `${SOURCE_ROOT}/images/sprites/*.svg`;
const PATHS_TO_WEBP = [PATH_TO_RASTER, `!${SOURCE_ROOT}/images/favicons/*.png`];
const PATHS_TO_VECTOR = `${SOURCE_ROOT}/images/**/*.svg`;
const PATHS_TO_FILES = [
  `${SOURCE_ROOT}/fonts/**/*.woff2`,
  `${SOURCE_ROOT}/*.ico`,
  `${SOURCE_ROOT}/*.webmanifest`,
];
const RESULT_TO_IMAGES = `${BUILD_ROOT}/images`;

const processMarkup = () => {
  return src([PATH_TO_MARKUP, `!${PATH_TO_TEMPLATES}`])
    .pipe(nunjucksCompile())
    .pipe(replace('.css', '.min.css'))
    .pipe(replace('.js', '.min.js'))
    .pipe(dest(BUILD_ROOT));
};

export const processStyles = () => {
  return src(PATH_TO_STYLE, { sourcemaps: true })
    .pipe(plumber())
    .pipe(sass().on('error', sass.logError))
    .pipe(postcss([
      autoprefixer(),
      csso()
    ]))
    .pipe(rename({ suffix: '.min' }))
    .pipe(dest(`${BUILD_ROOT}/css`, { sourcemaps: '.' }))
    .pipe(browser.stream());
};

const processScripts = () => {
  return src(PATH_TO_SCRIPTS)
    .pipe(terser())
    .pipe(rename({ suffix: '.min' }))
    .pipe(dest(`${BUILD_ROOT}/js`))
    .pipe(browser.stream());
};

const optimizeRaster = () => {
  return src(PATH_TO_RASTER, { encoding: false })
    .pipe(imagemin())
    .pipe(dest(RESULT_TO_IMAGES));
};

const copyImages = () => {
  return src(PATH_TO_RASTER, { encoding: false })
    .pipe(dest(RESULT_TO_IMAGES));
};

const createWebp = () => {
  return src(PATHS_TO_WEBP, { encoding: false })
    .pipe(webp())
    .pipe(dest(RESULT_TO_IMAGES));
};

const optimizeVector = () => {
  return src([PATHS_TO_VECTOR, `!${PATH_TO_SPRITES}`])
    .pipe(svgo())
    .pipe(dest(RESULT_TO_IMAGES));
};

const createStack = () => {
  return src(PATH_TO_SPRITES)
    .pipe(svgo())
    .pipe(stacksvg({ output: 'sprite.svg' }))
    .pipe(dest(RESULT_TO_IMAGES));
};

const copyFiles = (done) => {
  src(PATHS_TO_FILES, { base: SOURCE_ROOT })
    .pipe(dest(BUILD_ROOT));
  done();
};

const removeBuild = (done) => {
  rmSync(BUILD_ROOT, {
    force: true,
    recursive: true,
  });
  done();
}

const reloadServer = (done) => {
  browser.reload();
  done();
};

const startServer = () => {
  browser.init({
    server: {
      baseDir: BUILD_ROOT
    },
    cors: true,
    notify: false,
    ui: false,
  }, (err, bs) => {
    bs.addMiddleware('*', (req, res) => {
      res.write(readFileSync(`${BUILD_ROOT}/404.html`));
      res.end();
    });
  });

  watch(PATH_TO_STYLES, series(processStyles));
  watch(PATH_TO_SCRIPTS, series(processScripts));
  watch(PATH_TO_MARKUP, series(processMarkup, reloadServer));
  watch(
    PATH_TO_RASTER,
    series(
      copyImages,
      createWebp,
      processMarkup,
      reloadServer,
    )
  );
  watch(
    PATHS_TO_VECTOR,
    series(
      optimizeVector,
      createStack,
      processMarkup,
      reloadServer,
    )
  );
};

export const buildProd = (done) => {
  series(
    removeBuild,
    copyFiles,
    optimizeRaster,
    parallel(
      processStyles,
      processMarkup,
      processScripts,
      optimizeVector,
      createStack,
      createWebp,
    )
  )(done);
}

export const runDev = (done) => {
  series(
    removeBuild,
    copyFiles,
    copyImages,
    parallel(
      processStyles,
      processMarkup,
      processScripts,
      optimizeVector,
      createStack,
      createWebp
    ),
    startServer,
  )(done);
}
