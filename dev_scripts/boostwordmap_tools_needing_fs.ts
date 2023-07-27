import { BoostWordMap, catboost_feature_order, morph_code_catboost_cat_feature_order, morph_code_prediction_to_feature_dict } from "../src/boostwordmap_tools";
import * as catboost from "catboost";
import { Prediction, Engine } from 'wordmap';
import {Token} from "wordmap-lexer";
import { saveJson } from "./json_tools";
import { listToDictOfLists } from "../src/misc_tools";
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * Runs the CatBoost training process.
 *
 * @param {string} training_file - The path to the training file.
 * @param {string} model_output_file - The path to save the trained model.
 * @return {Promise<string>} A promise that resolves to the path of the trained model file.
 */
function run_catboost_training( training_file: string, model_output_file: string ): Promise<string>{
    return new Promise<string>((resolve, reject) => {
        // path to the python script
        const pythonScriptPath = path.resolve("./dev_scripts/catboost_training/train_catboost.py");

        // spawn a new process to run the python script
        const pythonProcess = spawn(path.resolve( './dev_scripts/catboost_training/venv/bin/python' ), 
            [pythonScriptPath, training_file, model_output_file], {
            shell: true, // use the shell to activate the virtual environment
            env: {
                ...process.env, // inherit the environment variables from the current process
                PYTHONPATH: process.env.PYTHONPATH + ':' + path.resolve('./dev_scripts/catboost_training/venv/lib/python3.10/site-packages'), // add the virtual environment to the PYTHONPATH
            },
        });

        // pipe the output of the python script to the console
        pythonProcess.stdout.pipe(process.stdout);
        pythonProcess.stderr.pipe(process.stderr);

        pythonProcess.on('error', (error) => {
            reject(new Error(`Failed to start subprocess: ${error.message}`));
        });

        // listen for the 'exit' event of the python process
        pythonProcess.on('exit', (code: number, signal) => {
            if( code === 0 ){
                resolve(model_output_file);
            }else{
                reject(new Error(`Python subprocess failed with exit code ${code} and signal ${signal}`));
            }
        });
    });
}


function scores_to_catboost_features( scores: {[key:string]:number} ){
    return catboost_feature_order.map( (feature_name) => ( (scores[feature_name] === undefined)?0:scores[feature_name] ) );
}

export class CatBoostWordMap extends BoostWordMap{

    protected catboost_model: catboost.Model | null = null;

    load_model_file( model_file: string ):void{
        this.catboost_model = new catboost.Model();
        this.catboost_model.loadModel( model_file );
    }

    catboost_score( predictions: Prediction[]): Prediction[] { 
        for( let prediction_i = 0; prediction_i < predictions.length; ++prediction_i ){
            const input_features_array = scores_to_catboost_features(predictions[prediction_i].getScores());
            //const confidence = this.catboost_model.predict( [input_features_array], [empty_categorical_features] )[0];
            const confidence = this.catboost_model.predict( [input_features_array], [[0]] )[0];
            predictions[prediction_i].setScore("confidence", confidence);
        }
        //This is how non-catboost confidence calculation is done:
        // const results = Engine.calculateConfidence(
        //      predictions,
        //      (map as any).engine.alignmentMemoryIndex
        // );
        return Engine.sortPredictions(predictions);
    }
    
    save_training_to_json( correct_predictions: Prediction[], incorrect_predictions: Prediction[], filename: string ): void{
        //first dump the data out to a json file
        const prediction_to_dict = function( prediction: Prediction, is_correct: boolean ): {[key: string]: string}{
            const result = {};
            catboost_feature_order.forEach( (feature_name) => {
                try {
                    result[feature_name] = prediction.getScore(feature_name) ?? 0;
                } catch (error) {
                    if (error.message.startsWith("Unknown score key")) {
                        result[feature_name] = 0;
                    } else {
                        throw error; // re-throw the error if it's not the expected error type
                    }
                }
            });
            result["output"] = is_correct?1:0;
            return result;
        };


        const training_data = correct_predictions.map( p => prediction_to_dict(p,true) )
            .concat( incorrect_predictions.map( p => prediction_to_dict(p,false) ) );

        saveJson( {
            "catboost_feature_order": catboost_feature_order,
            "catboost_cat_feature_order": [],
            "training_data": listToDictOfLists(training_data),
        },  filename);
    }

    
    do_boost_training( correct_predictions: Prediction[], incorrect_predictions: Prediction[] ): Promise<void>{
        this.save_training_to_json( correct_predictions, incorrect_predictions, "./dev_scripts/catboost_training/catboost_training_data.json" );

        //and now trigger a training by running a python command.
        return new Promise<void>((resolve, reject) => {
            run_catboost_training( path.resolve("./dev_scripts/catboost_training/catboost_training_data.json"), 
                                    path.resolve("./dev_scripts/catboost_training/catboost_model.cbm" ) ).then( (model_output_file) => {
                this.load_model_file( model_output_file );
                resolve();
            }).catch( (error) => {
                reject( error );
            });
        });
        
    }


}



export const first_letter_catboost_cat_feature_order : string[] = [
    "src_morph_0",
    "src_morph_1",
    "src_morph_2",
    "src_morph_3",
    "src_morph_4",
    "src_morph_5",
    "src_morph_6",
    "src_morph_7",
    "source_first_letter",
    "target_first_letter",
];

function first_letter_prediction_to_feature_dict( prediction: Prediction ): {[key:string]:(number|string)}{
    const result: {[key: string]:number|string} = {};
    const scores = prediction.getScores();
    catboost_feature_order.forEach( key => {
        result[key] = scores[key] ?? 0;
    });

    prediction.alignment.sourceNgram.getTokens().forEach( (token:Token) => {
        token.morph.split(",").forEach( (morph_piece,morph_index) =>{
            const categorical_key = `src_morph_${morph_index}`;
            if( first_letter_catboost_cat_feature_order.includes( categorical_key) ){
                if( !(categorical_key in result) ){
                    result[categorical_key] = ''
                }
    
                result[categorical_key] += morph_piece;
            }
        });
    });
    result["source_first_letter"] = prediction.alignment.sourceNgram.getTokens()?.[0]?.toString()?.[0] || "";
    result["target_first_letter"] = prediction.alignment.targetNgram.getTokens()?.[0]?.toString()?.[0] || "";
    first_letter_catboost_cat_feature_order.forEach( key => {
        if( !(key in result ) ){
            result[key] = "";
        }
    })
    return result;
}



function first_letter_prediction_to_catboost_features( prediction: Prediction ):[number[],string[]]{

    const as_dict: {[key: string]:number|string} = first_letter_prediction_to_feature_dict(prediction);

    const numerical_features : number[] = <number[]>catboost_feature_order.map( key => as_dict[key] ?? 0 );
    const cat_features : string[] = <string[]>first_letter_catboost_cat_feature_order.map( key => as_dict[key] ?? "" );

    return [numerical_features,cat_features];
}



export class FirstLetterBoostWordMap extends CatBoostWordMap{
    catboost_score( predictions: Prediction[]): Prediction[] { 
        for( let prediction_i = 0; prediction_i < predictions.length; ++prediction_i ){
            const [numerical_features,cat_features] = first_letter_prediction_to_catboost_features(predictions[prediction_i]);
            const confidence = this.catboost_model.predict( [numerical_features], [cat_features] )[0];
            predictions[prediction_i].setScore("confidence", confidence);
        }
        return Engine.sortPredictions(predictions);
    }

    save_training_to_json( correct_predictions: Prediction[], incorrect_predictions: Prediction[], filename: string ): void{
        //first dump the data out to a json file
        const prediction_to_dict = function( prediction: Prediction, is_correct: boolean ): {[key: string]: number|string}{
            const result = first_letter_prediction_to_feature_dict(prediction);
            result["output"] = is_correct?1:0;
            return result;
        };


        const training_data = correct_predictions.map( p => prediction_to_dict(p,true) )
            .concat( incorrect_predictions.map( p => prediction_to_dict(p,false) ) );

        saveJson( {
            "catboost_feature_order": catboost_feature_order,
            "catboost_cat_feature_order":first_letter_catboost_cat_feature_order,
            "training_data": listToDictOfLists(training_data),
        },  filename);
    }
}

function morph_code_prediction_to_catboost_features( prediction: Prediction ):[number[],string[]]{

    const as_dict: {[key: string]:number|string} = morph_code_prediction_to_feature_dict(prediction);

    const numerical_features : number[] = <number[]>catboost_feature_order.map( key => as_dict[key] ?? 0 );
    const cat_features : string[] = <string[]>morph_code_catboost_cat_feature_order.map( key => as_dict[key] ?? "" );

    return [numerical_features,cat_features];
}


export class MorphCatBoostWordMap extends CatBoostWordMap{
    catboost_score( predictions: Prediction[]): Prediction[] { 
        for( let prediction_i = 0; prediction_i < predictions.length; ++prediction_i ){
            const [numerical_features,cat_features] = morph_code_prediction_to_catboost_features(predictions[prediction_i]);
            const confidence = this.catboost_model.predict( [numerical_features], [cat_features] )[0];
            predictions[prediction_i].setScore("confidence", confidence);
        }
        return Engine.sortPredictions(predictions);
    }

    save_training_to_json( correct_predictions: Prediction[], incorrect_predictions: Prediction[], filename: string ): void{
        //first dump the data out to a json file
        const prediction_to_dict = function( prediction: Prediction, is_correct: boolean ): {[key: string]: number|string}{
            const result = morph_code_prediction_to_feature_dict(prediction);
            result["output"] = is_correct?1:0;
            return result;
        };


        const training_data = correct_predictions.map( p => prediction_to_dict(p,true) )
            .concat( incorrect_predictions.map( p => prediction_to_dict(p,false) ) );

        saveJson( {
            "catboost_feature_order": catboost_feature_order,
            "catboost_cat_feature_order":morph_code_catboost_cat_feature_order,
            "training_data": listToDictOfLists(training_data),
        },  filename);
    }
}