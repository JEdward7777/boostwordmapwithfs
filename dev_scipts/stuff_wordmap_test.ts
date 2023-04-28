import Lexer,{Token} from "wordmap-lexer";
import * as fs from "fs-extra";
//import {Suggestion, Engine, Prediction} from "../";
//import WordMap from "../";
import WordMap from "wordmap";

// import * as map_without_alignment from './map_without_alignment';
// import * as map_with_catboost from './map_with_catboost';

if (require.main === module) {
    const currentDirectory: string = process.cwd();
    console.log('Current working directory:', currentDirectory);
    console.log( "starting with node version: ", process.version );
}