import {WordMapProps} from "wordmap/core/WordMap"
import WordMap, { Alignment, Ngram, Suggestion, Prediction, Engine } from 'wordmap';
import Lexer,{Token} from "wordmap-lexer";
import {is_correct_prediction} from "./wordmap_tools"; 
import {saveJson, listToDictOfLists} from "./json_tools";
import { spawn } from 'child_process';
import * as path from 'path';
import * as catboost from "catboost";


export const catboost_feature_order : string[] = [
    "sourceCorpusPermutationsFrequencyRatio",
    "targetCorpusPermutationsFrequencyRatio",
    "sourceAlignmentMemoryFrequencyRatio",
    "targetAlignmentMemoryFrequencyRatio",
    "frequencyRatioCorpusFiltered",
    "frequencyRatioAlignmentMemoryFiltered",
    "sourceCorpusLemmaPermutationsFrequencyRatio",
    "targetCorpusLemmaPermutationsFrequencyRatio",
    "sourceAlignmentMemoryLemmaFrequencyRatio",
    "targetAlignmentMemoryLemmaFrequencyRatio",
    "lemmaFrequencyRatioCorpusFiltered",
    "lemmaFrequencyRatioAlignmentMemoryFiltered",
    "ngramRelativeTokenDistance",
    "alignmentRelativeOccurrence",
    "alignmentPosition",
    "phrasePlausibility",
    "lemmaPhrasePlausibility",
    "ngramLength",
    "characterLength",
    "alignmentOccurrences",
    "lemmaAlignmentOccurrences",
    "uniqueness",
    "lemmaUniqueness",
];



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


//The point of this class is to make a way of interract with WordMap
//which uses the same extended interface of the CatBoostWordMap interface.
export class PlaneWordMap extends WordMap{
    setTrainingRatio(ratio_of_training_data: number) { /*do nothing.*/ }

    add_alignments_1( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{
        // In "plane" the different ways of adding are all the same.
        Object.entries(alignments).forEach(([verseKey,verse_alignments]) => this.appendAlignmentMemory( verse_alignments ) );
        //return a thin promise just so that we have the same api as the other.
        return new Promise<void>(resolve => resolve());
    }
    add_alignments_2( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{
        return this.add_alignments_1( source_text, target_text, alignments );
    }
    add_alignments_3( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{
        return this.add_alignments_1( source_text, target_text, alignments );
    }
    add_alignments_4( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{
        return this.add_alignments_1( source_text, target_text, alignments );
    }
}

export class CatBoostWordMap extends PlaneWordMap{

    protected catboost_model: catboost.Model | null = null;
    protected ratio_of_training_data: number = 1; //The ratio of how much data to use so we can thin data.

    setTrainingRatio(ratio_of_training_data: number) {
        this.ratio_of_training_data = ratio_of_training_data;
    }

    constructor(opts?: WordMapProps){
        super(opts);
    }

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
    /**
     * Predicts the word alignments between the sentences.
     * @param {string} sourceSentence - a sentence from the source text
     * @param {string} targetSentence - a sentence from the target text
     * @param {number} maxSuggestions - the maximum number of suggestions to return
     * @param minConfidence - the minimum confidence score required for a prediction to be used
     * @return {Suggestion[]}
     */
    public predict(sourceSentence: string | Token[], targetSentence: string | Token[], maxSuggestions: number = 1, minConfidence: number = 0.1): Suggestion[] {
        let sourceTokens = [];
        let targetTokens = [];

        if (typeof sourceSentence === "string") {
            sourceTokens = Lexer.tokenize(sourceSentence);
        } else {
            sourceTokens = sourceSentence;
        }

        if (typeof targetSentence === "string") {
            targetTokens = Lexer.tokenize(targetSentence);
        } else {
            targetTokens = targetSentence;
        }

        const engine_run = (this as any).engine.run(sourceTokens, targetTokens);
        const predictions = this.catboost_score( engine_run );
        return Engine.suggest(predictions, maxSuggestions, (this as any).forceOccurrenceOrder, minConfidence);
    }

    collect_boost_training_data( source_text: {[key: string]: Token[]}, 
            target_text: {[key: string]: Token[]}, 
            alignments: {[key: string]: Alignment[] }, 
            ratio_of_incorrect_to_keep: number = .1 ): [Prediction[], Prediction[]] {
        const correct_predictions: Prediction[] = [];
        const incorrect_predictions: Prediction[] = [];

        Object.entries( alignments ).forEach( ([key,verse_alignments]) => {
            //collect every prediction
            const every_prediction: Prediction[] = (this as any).engine.run( source_text[key], target_text[key] )

            //iterate through them
            every_prediction.forEach( (prediction: Prediction) => {
                //figure out if the prediction is correct
                //If the prediction is correct, include it, if it isn't randomly include it.
                if( is_correct_prediction( prediction, verse_alignments ) ){
                    correct_predictions.push( prediction );
                }else if( Math.random() < ratio_of_incorrect_to_keep*this.ratio_of_training_data ){
                    incorrect_predictions.push( prediction );
                }
            });

        });

        //return the collected data.
        return [correct_predictions, incorrect_predictions];
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

    
    do_boost_training( correct_predictions: Prediction[], incorrect_predictions: Prediction[] ): Promise<string>{
        this.save_training_to_json( correct_predictions, incorrect_predictions, "./dev_scripts/catboost_training/catboost_training_data.json" );

        //and now trigger a training by running a python command.
        return run_catboost_training( path.resolve("./dev_scripts/catboost_training/catboost_training_data.json"), 
                                path.resolve("./dev_scripts/catboost_training/catboost_model.cbm" ) ).then()
    
    }


    // I don't know if I should produce the gradient boost training on the data on the same data which is stuffed into its alignment memory.  I suppose I can do some tests to figure this out.

    // So one:
    // 1 Do the alignment training with no verses included.  Then add the verses.
    // 2 Do the alignment training with half of the verses included. Then add the remainder.
    // 3 Do the alignment training with all the verses included already.
    // 4 Add the alignment memory for the first half and collect training data for the second half and then reverse to collect the trainnig data for the first half.

    add_alignments_1( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{
        // 1 Do the alignment training with no verses included.  Then add the verses.


        const [correct_predictions, incorrect_predictions] = this.collect_boost_training_data( source_text, target_text, alignments );


        Object.entries(alignments).forEach(([verseKey,verse_alignments]) => {
            this.appendAlignmentMemory( verse_alignments );
        });

        return new Promise<void>((resolve, reject) => {


            this.do_boost_training(correct_predictions, incorrect_predictions).then( (model_output_file) => {

                this.load_model_file( model_output_file );

                resolve();
            }).catch( (error) => {
                reject( error );
            });
        });
    }

    add_alignments_2( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{
        // 2 Do the alignment training with half of the verses included. Then add the remainder.
        const alignments_split_a = Object.fromEntries(Object.entries(alignments).filter((_, i) => i % 2 === 0));
        const alignments_split_b = Object.fromEntries(Object.entries(alignments).filter((_, i) => i % 2 !== 0));



        Object.entries(alignments_split_a).forEach(([verseKey,verse_alignments]) => this.appendAlignmentMemory( verse_alignments ) );

        const [correct_predictions, incorrect_predictions] = this.collect_boost_training_data( source_text, target_text, alignments_split_b );

        Object.entries(alignments_split_b).forEach(([verseKey,verse_alignments]) => this.appendAlignmentMemory( verse_alignments ) );

        return new Promise<void>((resolve, reject) => {
            this.do_boost_training(correct_predictions, incorrect_predictions).then( (model_output_file) => {
                this.load_model_file( model_output_file );
                resolve();
            }).catch( (error) => {
                reject( error );
            });
        });
    }

    add_alignments_3( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{
        // 3 Do the alignment training with all the verses included already.

        Object.entries(alignments).forEach(([verseKey,verse_alignments]) => {
            this.appendAlignmentMemory( verse_alignments );
        });


        const [correct_predictions, incorrect_predictions] = this.collect_boost_training_data( source_text, target_text, alignments );


        return new Promise<void>((resolve, reject) => {
            this.do_boost_training(correct_predictions, incorrect_predictions).then( (model_output_file) => {
                this.load_model_file( model_output_file );
                resolve();
            }).catch( (error) => {
                reject( error );
            });
        });
    
    }

    add_alignments_4( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{
        // 4 Add the alignment memory for the first half and collect training data for the second half and then reverse to collect the trainnig data for the first half.

        //split the alignment data into two groups.
        const alignments_split_a = Object.fromEntries(Object.entries(alignments).filter((_, i) => i % 2 === 0));
        const alignments_split_b = Object.fromEntries(Object.entries(alignments).filter((_, i) => i % 2 !== 0));

        //Add a and train on b
        Object.entries(alignments_split_a).forEach(([verseKey,verse_alignments]) => this.appendAlignmentMemory( verse_alignments ) );
        const [correct_predictions_1, incorrect_predictions_1] = this.collect_boost_training_data( source_text, target_text, alignments_split_b );

        this.clearAlignmentMemory();

        //now add b and train on a
        Object.entries(alignments_split_b).forEach(([verseKey,verse_alignments]) => this.appendAlignmentMemory( verse_alignments ) );
        const [correct_predictions_2, incorrect_predictions_2] = this.collect_boost_training_data( source_text, target_text, alignments_split_a );

        //now train the model on both of them.
        const correct_predictions = correct_predictions_1.concat( correct_predictions_2);
        const incorrect_predictions = incorrect_predictions_1.concat( incorrect_predictions_2 );
        return new Promise<void>((resolve, reject) => {
            this.do_boost_training(correct_predictions, incorrect_predictions).then( (model_output_file) => {
                this.load_model_file( model_output_file );
                resolve();
            }).catch( (error) => {
                reject( error );
            });
        });
    }
}


export const morph_code_catboost_cat_feature_order : string[] = [
    "src_morph_0",
    "src_morph_1",
    "src_morph_2",
    "src_morph_3",
    "src_morph_4",
    "src_morph_5",
    "src_morph_6",
    "src_morph_7",
];

function morph_code_prediction_to_feature_dict( prediction: Prediction ): {[key:string]:(number|string)}{
    const result: {[key: string]:number|string} = {};
    const scores = prediction.getScores();
    catboost_feature_order.forEach( key => {
        result[key] = scores[key] ?? 0;
    });

    prediction.alignment.sourceNgram.getTokens().forEach( (token:Token) => {
        token.morph.split(",").forEach( (morph_piece,morph_index) =>{
            const categorical_key = `src_morph_${morph_index}`;
            if( morph_code_catboost_cat_feature_order.includes( categorical_key) ){
                if( !(categorical_key in result) ){
                    result[categorical_key] = ''
                }
    
                result[categorical_key] += morph_piece;
            }
        });
    });
    morph_code_catboost_cat_feature_order.forEach( key => {
        if( !(key in result ) ){
            result[key] = "";
        }
    })
    return result;
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