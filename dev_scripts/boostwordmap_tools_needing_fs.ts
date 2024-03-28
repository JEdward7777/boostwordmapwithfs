import { AbstractWordMapWrapper, BoostWordMap, catboost_feature_order, morph_code_catboost_cat_feature_order, morph_code_prediction_to_feature_dict } from "wordmapbooster/dist/boostwordmap_tools";
import * as catboost from "catboost";
import { Prediction, Engine, Alignment, Suggestion, Ngram } from 'wordmap';
import Lexer, {Token} from "wordmap-lexer";
import { saveJson } from "./json_tools";
import { listToDictOfLists } from "wordmapbooster/dist/misc_tools";
import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { find_token } from "./eflomal_tests/alignment_to_eflomal_output_format";
import { run_eflomal_align, run_eflomal_make_priors } from "./eflomal_tests/eflomal_runner";
import { updateTokenLocations } from "wordmapbooster/dist/wordmap_tools";
import assert = require("assert");

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


    protected model_score(predictions: Prediction[]): void {
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
    model_score( predictions: Prediction[]): void { 
        for( let prediction_i = 0; prediction_i < predictions.length; ++prediction_i ){
            const [numerical_features,cat_features] = first_letter_prediction_to_catboost_features(predictions[prediction_i]);
            const confidence = this.catboost_model.predict( [numerical_features], [cat_features] )[0];
            predictions[prediction_i].setScore("confidence", confidence);
        }
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
    model_score( predictions: Prediction[]): void { 
        for( let prediction_i = 0; prediction_i < predictions.length; ++prediction_i ){
            const [numerical_features,cat_features] = morph_code_prediction_to_catboost_features(predictions[prediction_i]);
            const confidence = this.catboost_model.predict( [numerical_features], [cat_features] )[0];
            predictions[prediction_i].setScore("confidence", confidence);
        }
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

export class EflomalMap{

    readonly exported_corpus_filename = "./dev_scripts/eflomal_tests/exported_corpus.txt";
    readonly exported_alignments_filename = "./dev_scripts/eflomal_tests/exported_alignments.txt";
    readonly exported_priors_filename = "./dev_scripts/eflomal_tests/exported_priors.txt";

    readonly alignments_output_forward_filename = "./dev_scripts/eflomal_tests/alignments_output_forward.txt";
    readonly alignments_output_backward_filename = "./dev_scripts/eflomal_tests/alignments_output_backward.txt";

    readonly alignment_output_scores_forward_filename = "./dev_scripts/eflomal_tests/alignment_output_scores_forward.txt";
    readonly alignment_output_scores_backward_filename = "./dev_scripts/eflomal_tests/alignment_output_scores_backward.txt";

    //This isn't used during generating the priors but during the prediction.
    private corpus_source: {[key: string]: Token[]};
    private corpus_target: {[key: string]: Token[]};


    async add_alignments( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{
        this.appendKeyedCorpusTokens( source_text, target_text );


        //generate a corpus file and an alignment file for eflomal to generate priors from.
        const output_corpus_file = fs.openSync(this.exported_corpus_filename, "w");
        const output_alignment_file = fs.openSync(this.exported_alignments_filename, "w");

        //write the data to the output file.
        //Iterate through all the keys available in output_file.wm_target_lang_book__train and then
        //write the value for that and the associated value from wm_source_lang_book to the file separated by |||
        for (const [reference, target_verse] of Object.entries(target_text)) {
            //check if the key is in wm_source_lang_book
            if (Object.keys(source_text).includes(reference)) {
                const source_verse = source_text[reference];

                //Join all the entries in target_verse into a single string separated by spaces.
                const target_verse_string = target_verse.join(" ");
                const source_verse_string = source_verse.join(" ");


                //write the value to the file
                fs.writeSync(output_corpus_file, source_verse_string + " ||| " + target_verse_string + "\n");



                //Now write the result for the alignment
                const these_alignments = alignments[reference];
                these_alignments.forEach( alignment => {
                    alignment.sourceNgram.getTokens().forEach( source_token => {
                        const source_index = find_token( source_token, source_verse );
                        if( source_index !== -1 ){
                            alignment.targetNgram.getTokens().forEach( target_token => {
                                const target_index = find_token( target_token, target_verse );
                                if( target_index !== -1 ){
                                    fs.writeSync(output_alignment_file, `${source_index}-${target_index} `);                                
                                }
                            })
                        }
                    })
                })

                fs.writeSync(output_alignment_file, "\n");
        
            }
        }

        //close all the files
        fs.closeSync(output_corpus_file);
        fs.closeSync(output_alignment_file);

        //Now run the eflomal command to generate the priors
        await run_eflomal_make_priors( this.exported_corpus_filename, this.exported_alignments_filename, this.exported_priors_filename );

        return;
    }

    public appendKeyedCorpusTokens( sourceTokens: {[key:string]: Token[]}, targetTokens: {[key:string]: Token[]}){
        //Add all of sourceTokens to corpus_source
        this.corpus_source = { ...this.corpus_source, ...sourceTokens };
        //Add all of targetTokens to corpus_target
        this.corpus_target = { ...this.corpus_target, ...targetTokens };
    }


    predict(sourceSentence: string | Token[], targetSentence: string | Token[], maxSuggestions?: number, manuallyAligned: Alignment[] = []): Suggestion[]{
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


        updateTokenLocations( sourceTokens );
        updateTokenLocations( targetTokens );

        //need to write this to an output file to feed to eflomal
        const output_file = fs.openSync(this.exported_corpus_filename, "w");
        fs.writeSync(output_file, sourceTokens.join(" ") + " ||| " + targetTokens.join(" ") + "\n");

        //now append all the corpus information as well.
        for (const [reference, target_verse] of Object.entries(this.corpus_target)) {
            //check if the key is in wm_source_lang_book
            if (Object.keys(this.corpus_source).includes(reference)) {
                const source_verse = this.corpus_source[reference];

                //Join all the entries in target_verse into a single string separated by spaces.
                const target_verse_string = target_verse.join(" ");
                const source_verse_string = source_verse.join(" ");


                //write the value to the file
                fs.writeSync(output_file, source_verse_string + " ||| " + target_verse_string + "\n");
            }
        }

        //close the files
        fs.closeSync(output_file);

        //Now run the eflomal command while referencing the prior file.
        run_eflomal_align( this.exported_corpus_filename, this.exported_priors_filename, this.alignments_output_forward_filename, this.alignments_output_backward_filename, this.alignment_output_scores_forward_filename, this.alignment_output_scores_backward_filename );

        //Now need to read in the first line of both of those alignment files, merge them and return them as suggestions.
        //TODO: need to implement the rest of this. 
        //This is tricky because if we get 0-1 and 1-1 and 1-2 that means 0-2 is a thing by transitivity, so I basically am going to need to build a
        //membership map.

        //first do a map
        const id_to_leader_id: {[key: string]: string} = {};
        const get_leader_id = function( id: string ): string{
            if( !id_to_leader_id[id] ) id_to_leader_id[id] = id;
            const leader_id = (id_to_leader_id[id] == id) ? id : get_leader_id( id_to_leader_id[id] );
            id_to_leader_id[id] = leader_id;
            return leader_id;
        }
        const join_groups = function( id1: string, id2: string ){
            id_to_leader_id[get_leader_id(id1)] = get_leader_id(id2);
        }
        
        // const first_line_mappings = fs.readFileSync( this.alignments_output_forward_filename, "utf8" ).split( "\n" )[0] + " " +
        //                     fs.readFileSync( this.alignments_output_backward_filename, "utf8" ).split( "\n" )[0];
        const first_line_mappings = fs.readFileSync( this.alignments_output_backward_filename, "utf8" ).split( "\n" )[0];

        first_line_mappings.split( " " ).forEach( pair => {
            const source_id = pair.split( "-" )[0];
            const target_id = pair.split( "-" )[1];
            join_groups( `s${source_id}`, `t${target_id}` );
        });

        //get the score for the first alignment by reading the first line of the forward and backwards scores file and averaging them together.
        // const first_line_score_forward = parseFloat(fs.readFileSync( this.alignment_output_scores_forward_filename, "utf8" ).split( "\n" )[0]);
        const first_line_score_backward = parseFloat(fs.readFileSync( this.alignment_output_scores_backward_filename, "utf8" ).split( "\n" )[0]);
        // const alignment_score = (first_line_score_forward + first_line_score_backward)/2;
        const alignment_score = first_line_score_backward;

        //then convert that into lists.
        const leader_id_to_attendance: {[key: string]: {source_indexes: number[], target_indexes: number[]}} = {};
        Object.keys( id_to_leader_id ).forEach( member_id => {
            const leader_id = get_leader_id(member_id);
            //check if that leader_id is already in leader_id_to_attendance
            if( !(leader_id in leader_id_to_attendance) ){
                leader_id_to_attendance[leader_id] = {source_indexes: [], target_indexes: []};
            }
            //split off the s or t
            const s_or_t = member_id[0];
            //take everything after the first char which is s or t
            const member_number = parseInt(member_id.substring(1));
            if( s_or_t === "s" ){
                leader_id_to_attendance[leader_id].source_indexes.push( member_number );
            }else{
                leader_id_to_attendance[leader_id].target_indexes.push( member_number );
            }
        })
        
        //we now have all the memberships, so dump the dictionary out into a list and sort it by the lowest target index.
        const membershipList = Object.values(leader_id_to_attendance);
        
        // Sort the list by the lowest target index
        membershipList.sort((a, b) => {
          const lowestTargetIndexA = Math.min(1e10,...a.target_indexes);
          const lowestTargetIndexB = Math.min(1e10,...b.target_indexes);
          return lowestTargetIndexA - lowestTargetIndexB;
        });

        // Now also sort the members in the index.
        membershipList.forEach((membership) => {
          membership.source_indexes.sort((a, b) => a - b);
          membership.target_indexes.sort((a, b) => a - b);
        });


        //then convert that into alignment objects.
        const convertedAlignment = membershipList.map( (membership) => {
            const sourceNgram = new Ngram( membership.source_indexes.map( token_index => sourceTokens[token_index] ));
            const targetNgram = new Ngram( membership.target_indexes.map( token_index => targetTokens[token_index] ));
            const alignment = new Alignment( sourceNgram, targetNgram );
            return alignment;
        });

        //wrap as predictions.
        const predictions = convertedAlignment.map( alignment => {
            const as_prediction = new Prediction( alignment );
            
            //set the confidence for all the alignments to the confidence of the entire sentence because that is what is
            //available.  Also it shouldn't be > 1 but again that is what we have.
            as_prediction.setScore("confidence", alignment_score);

            return as_prediction;
        });

        //and wrap it in a Suggestion object.
        const suggestion = new Suggestion();
        predictions.forEach( prediction => suggestion.addPrediction( prediction ) );

        //We can only create one suggestion so hopefully the calling code won't be offended.
        return [suggestion];
    }

    //Eflomal doesn't have four different ways of adding, but adding these just for compatibility.
    add_alignments_1( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{ return this.add_alignments( source_text, target_text, alignments ); }
    add_alignments_2( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{ return this.add_alignments( source_text, target_text, alignments ); }
    add_alignments_3( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{ return this.add_alignments( source_text, target_text, alignments ); }
    add_alignments_4( source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }):Promise<void>{ return this.add_alignments( source_text, target_text, alignments ); }
    //Not needed, but including it for compatibility with the other models which need this.
    setTrainingRatio( ratio: number ){}

}