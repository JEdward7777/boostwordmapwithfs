import {WordMapProps} from "wordmap/core/WordMap"
import WordMap, { Alignment, Ngram, Suggestion, Prediction, Engine } from 'wordmap';
import Lexer,{Token} from "wordmap-lexer";
import {is_correct_prediction, is_part_of_correct_prediction} from "./wordmap_tools"; 
import {saveJson, listToDictOfLists} from "./json_tools";
import { spawn } from 'child_process';
import * as path from 'path';
import * as catboost from "catboost";
import {JLBoost} from "./JLBoost";


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

export abstract class AbstractWordMapWrapper extends WordMap{
    constructor(opts?: WordMapProps){
        super(opts);
    }

}

export abstract class BoostWordMap extends AbstractWordMapWrapper{

    protected ratio_of_training_data: number = 1; //The ratio of how much data to use so we can thin data.

    setTrainingRatio(ratio_of_training_data: number) {
        this.ratio_of_training_data = ratio_of_training_data;
    }

    abstract catboost_score( predictions: Prediction[]): Prediction[];

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

    abstract do_boost_training( correct_predictions: Prediction[], incorrect_predictions: Prediction[] ): Promise<void>;


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

        return this.do_boost_training(correct_predictions, incorrect_predictions);
    }

    add_alignments_2( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{
        // 2 Do the alignment training with half of the verses included. Then add the remainder.
        const alignments_split_a = Object.fromEntries(Object.entries(alignments).filter((_, i) => i % 2 === 0));
        const alignments_split_b = Object.fromEntries(Object.entries(alignments).filter((_, i) => i % 2 !== 0));



        Object.entries(alignments_split_a).forEach(([verseKey,verse_alignments]) => this.appendAlignmentMemory( verse_alignments ) );

        const [correct_predictions, incorrect_predictions] = this.collect_boost_training_data( source_text, target_text, alignments_split_b );

        Object.entries(alignments_split_b).forEach(([verseKey,verse_alignments]) => this.appendAlignmentMemory( verse_alignments ) );

        return this.do_boost_training(correct_predictions, incorrect_predictions);
    }

    add_alignments_3( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{
        // 3 Do the alignment training with all the verses included already.

        Object.entries(alignments).forEach(([verseKey,verse_alignments]) => {
            this.appendAlignmentMemory( verse_alignments );
        });


        const [correct_predictions, incorrect_predictions] = this.collect_boost_training_data( source_text, target_text, alignments );

        return this.do_boost_training(correct_predictions, incorrect_predictions);
    
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

        return this.do_boost_training(correct_predictions, incorrect_predictions);
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
}

//The point of this class is to make a way of interract with WordMap
//which uses the same extended interface of the CatBoostWordMap interface.
export class PlaneWordMap extends AbstractWordMapWrapper{
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

    do_boost_training( correct_predictions: Prediction[], incorrect_predictions: Prediction[] ): Promise<void>{
        //no boost type training in the plane word map.
        return Promise.resolve();
    }
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


function jlboost_prediction_to_feature_dict( prediction: Prediction ): {[key:string]:number}{
    const result: {[key: string]:number} = {};
    const scores = prediction.getScores();
    catboost_feature_order.forEach( key => {
        result[key] = scores[key] ?? 0;
    });
    return result;
}

export class JLBoostWordMap extends BoostWordMap{
    protected jlboost_model: JLBoost | null = null;

    catboost_score( predictions: Prediction[]): Prediction[] { 
        for( let prediction_i = 0; prediction_i < predictions.length; ++prediction_i ){
            const numerical_features = jlboost_prediction_to_feature_dict(predictions[prediction_i]);
            const confidence = this.jlboost_model.predict_single( numerical_features );
            predictions[prediction_i].setScore("confidence", confidence);
        }
        return Engine.sortPredictions(predictions);
    }

    do_boost_training( correct_predictions: Prediction[], incorrect_predictions: Prediction[] ): Promise<void>{
        //first collect the data to train on.
        const prediction_to_dict = function( prediction: Prediction, is_correct: boolean ): {[key: string]: number}{
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

        

        this.jlboost_model = new JLBoost({});

        return new Promise<void>((resolve) => {
            this.jlboost_model.train({
                xy_data:training_data,
                y_index:"output",
                n_steps:1000,
                tree_depth:12,//7,
                //tree_depth:2,
                talk:true,
            });
            resolve();
        });
    }
}


export class JLBoostMultiWordMap extends JLBoostWordMap{
    //collect_boost_training_data needs to not use is_correct_prediction but something like is_sub_correct_prediciton
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
                if( prediction.target.getTokens().length != 1 || prediction.source.getTokens().length != 1 ){
                    //Filter out ngrams greater then 1.
                }else if( is_part_of_correct_prediction( prediction, verse_alignments ) ){
                    correct_predictions.push( prediction );
                }else if( Math.random() < ratio_of_incorrect_to_keep*this.ratio_of_training_data ){
                    incorrect_predictions.push( prediction );
                }
            });

        });
        
        //return the collected data.
        return [correct_predictions, incorrect_predictions];
    }
    
    //catboost_score needs to be changed to not just return what was given but instead assemble it into ngrams.
    catboost_score( predictions: Prediction[]): Prediction[] { 
        //first filter to just single token predictions.
        const just_singles = predictions.filter( (p: Prediction) => p.target.getTokens().length == 1 && p.source.getTokens().length == 1 );

        //now run the set score on all of them.
        just_singles.forEach( (p: Prediction) => {
            const numerical_features = jlboost_prediction_to_feature_dict(p);
            const confidence = this.jlboost_model.predict_single( numerical_features );
            p.setScore("confidence", confidence);
        });

        return just_singles;
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
        const ngram_predictions = create_ngram_predictions( predictions );

        const suggestion = ngram_predictions.reduce( (s:Suggestion, p:Prediction) => {
            s.addPrediction(p);
            return s;
        }, new Suggestion() );

        return [suggestion];
    }
}

//This version is the same as JLBoostMultiWordMap except that it includes the ngram output of wordmap
//as extra information.
export class JLBoostMultiWordMap2 extends JLBoostWordMap{
    //collect_boost_training_data needs to not use is_correct_prediction but something like is_sub_correct_prediciton
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

                //Don't grade a null assignment as correct unless it is right.
                //subset doesn't count.
                const is_null_suggestion = (prediction.target.tokenLength === 0 || prediction.source.tokenLength === 0 );

                let is_correct = is_null_suggestion?
                        is_correct_prediction(prediction,verse_alignments):
                        is_part_of_correct_prediction(prediction,verse_alignments);

                if( is_correct ){
                    correct_predictions.push( prediction );
                }else if( Math.random() < ratio_of_incorrect_to_keep*this.ratio_of_training_data ){
                    incorrect_predictions.push( prediction );
                }
            });

        });
        
        //return the collected data.
        return [correct_predictions, incorrect_predictions];
    }
    
    //catboost_score needs to be changed to not just return what was given but instead assemble it into ngrams.
    catboost_score( predictions: Prediction[]): Prediction[] { 
        //now run the set score on all of them.
        predictions.forEach( (p: Prediction) => {
            const numerical_features = jlboost_prediction_to_feature_dict(p);
            const confidence = this.jlboost_model.predict_single( numerical_features );
            p.setScore("confidence", confidence);
        });

        return predictions;
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
        const ngram_predictions = create_ngram_predictions( predictions );

        const suggestion = ngram_predictions.reduce( (s:Suggestion, p:Prediction) => {
            s.addPrediction(p);
            return s;
        }, new Suggestion() );

        return [suggestion];
    }
}



class LinkGroup{
    source_members: string[] = [];
    target_members: string[] = [];
    token_links: {[key: string]: { strength: number, target: string}[]} = {};

    ngram_max_size(): number{
        return Math.max(this.source_members.length,this.target_members.length);
    }

    add_links( source: string, links:{strength:number,target:string}[] ):void{
        if( !(source in this.source_members) ){
            this.source_members.push( source );
        }
        for( const link of links ){
            if( !this.target_members.includes(link.target) ){
                this.target_members.push( link.target );
            }
        }
        if( !(source in this.token_links) ){
            this.token_links[source] = [];
        }
        this.token_links[source].push(...links);
    }

    split(): LinkGroup[]{
        //find whatever link is the weakest but isn't the last connection to 
        //a node or source and then break it.
        const source_link_counts: {[key:string]:number} = {};
        const target_link_counts: {[key:string]:number} = {};

        for( const [source, links] of Object.entries(this.token_links) ){
            for( const link of links ){
                source_link_counts[source]      = 1+(source_link_counts[source]      || 0)
                target_link_counts[link.target] = 1+(target_link_counts[link.target] || 0)
            }
        }

        //figure out what links if removed would not produce an unpaired word.
        const expendable_links : {[key:string]:{strength:number,target:string}[]} = {};
        for( const [source, links] of Object.entries(this.token_links) ){
            if( source_link_counts[source] > 1 ){
                for( const link of links ){
                    if( target_link_counts[link.target] > 1 ){
                        if(!(source in expendable_links)){
                            expendable_links[source] = [];
                        }
                        expendable_links[source].push(link);
                    }
                }
            }
        }

        let weakest_source : string | null = null;
        let weakest_target : string | null = null;
        let weakest_strength : number = 0;
        for( const [source, links] of Object.entries(expendable_links) ){
            for( const link of links ){
                if( weakest_source === null || link.strength < weakest_strength ){
                    weakest_source = source;
                    weakest_target = link.target;
                    weakest_strength = link.strength;
                }
            }
        }

        const links_without_weakest : {[key:string]:{strength:number,target:string}[]} = {};
        for( const [source, links] of Object.entries(this.token_links) ){
            //if the source doesn't match or we have already broken a link, just copy all the links.
            if( source !== weakest_source  ){
                links_without_weakest[source] = links;
            }else{
                //if the source does match, drop the first link matching the selected strength.
                links_without_weakest[source] = [];
                for( const link of links ){
                    if( link.strength != weakest_strength || link.target !== weakest_target ){
                        links_without_weakest[source].push( link )
                    }
                }
            }
        }

        //Don't worry if the group didn't actually get split, it is closer to being split.
        return determine_groups( links_without_weakest );
    }
}

function recursive_get_group_owner( group_owner: {[key:string]: string}, key: string ): string{
    if( !(key in group_owner) ) return key;
    let owner = group_owner[key];
    if( owner != key ){
        owner = recursive_get_group_owner( group_owner, owner );
        group_owner[key] = owner;
    }
    return owner;
}

function link_groups( group_owner: {[key:string]: string}, key1: string, key2: string ): void{
    const owner1 = recursive_get_group_owner( group_owner, key1 );
    const owner2 = recursive_get_group_owner( group_owner, key2 );
    group_owner[owner1] = owner2;
}

function determine_groups( token_links: {[key: string]: { strength: number, target: string}[]} ): LinkGroup[]{
    const link_valid_threshold = .5;

    const group_owner: {[key:string]: string} = {};

    for( const [source,links] of Object.entries( token_links )){
        for(const link of links ){
            if( link.strength > link_valid_threshold ){
                link_groups(group_owner, `s:${source}`, `t:${link.target}`);
            }
        }
    }

    const labeled_groups: {[key:string]: LinkGroup} = {};

    for( const [source,links] of Object.entries( token_links )){
        const group_name = recursive_get_group_owner( group_owner, `s:${source}` );

        const non_broken_links = links.filter( (link) => group_name == recursive_get_group_owner(group_owner, `t:${link.target}`) );

        //now only make a group for this if it has any remaining links.
        if( non_broken_links.length > 0 ){
            if(!(group_name in labeled_groups)){
                labeled_groups[group_name] = new LinkGroup();
            }

            //add all the links which stay in this group.  We have a link-valid_threshold and
            //these need to be broken 
            labeled_groups[group_name].add_links( source, non_broken_links );
        }
    }

    return Object.values( labeled_groups );
}

function break_into_groups( token_links: {[key: string]: { strength: number, target: string}[]}, max_ngram_size=4  ):LinkGroup[]{
    let to_process :LinkGroup[] = determine_groups(token_links);

    let result :LinkGroup[] = [];

    //keep breaking apart the groups until they are all below ngramsize of max_ngram_size
    while( to_process.length > 0 ){
        const link_group = to_process.pop();
        if( link_group.ngram_max_size() <= max_ngram_size || link_group.source_members.length < 2 || link_group.target_members.length < 2 ){
            result.push( link_group );
        }else{
            to_process.push( ...link_group.split());
        }
    }
    return result;
}

function token_to_hash(t : Token): string{
    return `${t.toString()}:${t.occurrence}:${t.occurrences}`;
}

function dedup_hash_links( hash_links: {[key: string]: { strength: number, target: string}[]} ): {[key: string]: { strength: number, target: string}[]} {

    const source_target_hashed: {[key: string]: { source: string, strength: number, target: string}} = {};

    Object.entries( hash_links ).forEach( ([source,links]) => {
        links.forEach( (link) => {
            const source_target_key = `${source}->${link.target}`;
            //take only the strongest link.
            if( !(source_target_key in source_target_hashed) || source_target_hashed[source_target_key].strength < link.strength ){
                source_target_hashed[source_target_key] = {
                    source: source,
                    strength: link.strength,
                    target: link.target
                };
            }
        });
    });

    //now convert the format back.
    const result: {[key: string]: { strength: number, target: string}[]} = {};
    Object.values( source_target_hashed ).forEach( (link) => {
        if( !(link.source in result) ){
            result[link.source] = [];
        }
        result[link.source].push({
            strength: link.strength,
            target: link.target
        });
    });

    return result;
}

function create_ngram_predictions( scored_predictions: Prediction[] ): Prediction[]{
    

    const source_token_hashes: {[key: string]: Token} = {};
    const target_token_hashes: {[key: string]: Token} = {};

    const token_hash_links_with_dupes: {[key: string]: { strength: number, target: string}[]} = {};
    scored_predictions.forEach( (p: Prediction) => {
        p.source.getTokens().forEach( (t: Token) => source_token_hashes[token_to_hash(t)] = t );
        p.target.getTokens().forEach( (t: Token) => target_token_hashes[token_to_hash(t)] = t );
        p.source.getTokens().forEach( (source: Token) => {
            p.target.getTokens().forEach( (target: Token) => {
                const source_hash = token_to_hash(source);
                if(!(source_hash in token_hash_links_with_dupes)){
                    token_hash_links_with_dupes[source_hash]=[];
                }
                token_hash_links_with_dupes[source_hash].push({
                    strength: p.getScore("confidence"),
                    target: token_to_hash(target)
                });
            });
        });
    });

    const token_hash_links_deduped = dedup_hash_links( token_hash_links_with_dupes );


    const link_groups = break_into_groups( token_hash_links_deduped );


    const result: Prediction[] = [];
    for( const link_group of link_groups ){
        const source_tokens: Token[] = link_group.source_members.map( (token_hash) => source_token_hashes[token_hash] );
        const target_tokens: Token[] = link_group.target_members.map( (token_hash) => target_token_hashes[token_hash] );

        result.push( new Prediction( new Alignment( new Ngram( source_tokens ), new Ngram( target_tokens ))));
    }

    return result;
}

export class MorphJLBoostWordMap extends BoostWordMap{
    protected jlboost_model: JLBoost | null = null;

    catboost_score( predictions: Prediction[]): Prediction[] { 
        for( let prediction_i = 0; prediction_i < predictions.length; ++prediction_i ){
            const numerical_features = morph_code_prediction_to_feature_dict(predictions[prediction_i]);
            const confidence = this.jlboost_model.predict_single( numerical_features );
            predictions[prediction_i].setScore("confidence", confidence);
        }
        return Engine.sortPredictions(predictions);
    }

    do_boost_training( correct_predictions: Prediction[], incorrect_predictions: Prediction[] ): Promise<void>{
        //first collect the data to train on.
        const prediction_to_dict = function( prediction: Prediction, is_correct: boolean ): {[key: string]: number|string}{
            const result = morph_code_prediction_to_feature_dict(prediction);
            result["output"] = is_correct?1:0;
            return result;
        };


        const training_data = correct_predictions.map( p => prediction_to_dict(p,true) )
            .concat( incorrect_predictions.map( p => prediction_to_dict(p,false) ) );

        

        this.jlboost_model = new JLBoost({ categorical_catagories: morph_code_catboost_cat_feature_order });

        return new Promise<void>((resolve) => {
            this.jlboost_model.train({
                xy_data:training_data,
                y_index:"output",
                n_steps:1000,
                tree_depth:12,//7,
                //tree_depth:2,
                talk:true,
            });
            resolve();
        });
    }
}
