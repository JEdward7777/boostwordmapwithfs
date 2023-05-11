 import {recursive_json_load, saveJson} from "./json_tools";
import {ChapterVerse, add_book_alignment_to_wordmap, extract_alignment_frequency, compile_verse_text_pair,
    convert_tc_to_token_dict, convert_alignment_to_alignment_dict, grade_mapping_method,
    word_map_predict_tokens} from "./wordmap_tools";
import WordMap, {Suggestion,Alignment} from "wordmap";
import { createWriteStream } from 'fs';
import {Token} from "wordmap-lexer";
import CatBoostWordMap from "./boostwordmap_tools";


function run_plane_wordmap_test(){
    const loaded_alignment = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/.apps/translationCore/alignmentData/mat")

    //here is matthew
    const mat_english  = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/mat" );
    const mat_greek    = recursive_json_load( "/home/lansford/work2/Mission_Mutual/translationCore/tcResources/el-x-koine/bibles/ugnt/v0.30_Door43-Catalog/books.zip" ).mat

    const mat_lte_c14 = Object.fromEntries( Object.entries( mat_english).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) <= 14 ) );
    const mat_gt_c14 = Object.fromEntries( Object.entries( mat_english).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) > 14 ) );


    const map = new WordMap({ targetNgramLength: 5, warnings: false });
    add_book_alignment_to_wordmap( mat_lte_c14, loaded_alignment, map);



    const converted_mat_lte_c14 = convert_tc_to_token_dict( "mat", mat_lte_c14, false );
    const converted_mat_gt_c14  = convert_tc_to_token_dict( "mat", mat_gt_c14,  false );
    const converted_mat_greek = convert_tc_to_token_dict( "mat", mat_greek, true );
    const train_alignment = convert_alignment_to_alignment_dict( "mat", loaded_alignment, converted_mat_greek, converted_mat_lte_c14);
    const test_alignment = convert_alignment_to_alignment_dict( "mat", loaded_alignment, converted_mat_greek, converted_mat_gt_c14);


    const mat_split_plane_csv = createWriteStream( "dev_scripts/data/mat_split_plane.csv" );

    //function plane_wordmap_method( from_tokens: Token[], to_tokens: Token[] ) => Suggestion[]{
        // return word_map_predict_tokens( map, from_tokens, to_tokens );
    //}
    const plane_wordmap_method = function( from_tokens: Token[], to_tokens: Token[] ): Suggestion[]{
        return word_map_predict_tokens( map, from_tokens, to_tokens );
    }

    grade_mapping_method( 
        converted_mat_greek, //source_sentence_tokens_dict
        converted_mat_gt_c14, //target_sentence_tokens_dict
        test_alignment, //manual_mappings_dict
        mat_split_plane_csv, //output_stream
         plane_wordmap_method //mapping_function
        )
    mat_split_plane_csv.end();


    console.log( "done" );
}

function run_catboost_test_with_alignment_adding_method( number_suffix: string, alignment_adder: (source_text: {[key: string]: Token[]}, target_text: {[key: string]: Token[]}, alignments: {[key: string]: Alignment[] }) => Promise<void>){
    const loaded_alignment = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/.apps/translationCore/alignmentData/mat")

    //here is matthew
    const mat_english  = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/mat" );
    const mat_greek    = recursive_json_load( "/home/lansford/work2/Mission_Mutual/translationCore/tcResources/el-x-koine/bibles/ugnt/v0.30_Door43-Catalog/books.zip" ).mat

    const mat_lte_c14 = Object.fromEntries( Object.entries( mat_english).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) <= 14 ) );
    const mat_gt_c14 = Object.fromEntries( Object.entries( mat_english).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) > 14 ) );


    const boostMap = new CatBoostWordMap({ targetNgramLength: 5, warnings: false });


    const converted_mat_lte_c14 = convert_tc_to_token_dict( "mat", mat_lte_c14, false );
    const converted_mat_gt_c14  = convert_tc_to_token_dict( "mat", mat_gt_c14,  false );
    const converted_mat_greek = convert_tc_to_token_dict( "mat", mat_greek, true );
    const train_alignment = convert_alignment_to_alignment_dict( "mat", loaded_alignment, converted_mat_greek, converted_mat_lte_c14);
    const test_alignment = convert_alignment_to_alignment_dict( "mat", loaded_alignment, converted_mat_greek, converted_mat_gt_c14);


    alignment_adder.call( boostMap, converted_mat_greek, converted_mat_lte_c14, train_alignment ).then(() => {

        const output_csv = createWriteStream( `dev_scripts/data/mat_split_catboost_${number_suffix}.csv` );

        //function plane_wordmap_method( from_tokens: Token[], to_tokens: Token[] ) => Suggestion[]{
            // return word_map_predict_tokens( map, from_tokens, to_tokens );
        //}
        const predict_method = function( from_tokens: Token[], to_tokens: Token[] ): Suggestion[]{
            return boostMap.predict( from_tokens, to_tokens );
        }

        grade_mapping_method( 
            converted_mat_greek, //source_sentence_tokens_dict
            converted_mat_gt_c14, //target_sentence_tokens_dict
            test_alignment, //manual_mappings_dict
            output_csv, //output_stream
            predict_method //mapping_function
            )
            output_csv.end();


        console.log( "done" );
    });
}

function run_catboost_wordmap_test_1(){
    run_catboost_test_with_alignment_adding_method( "1h", CatBoostWordMap.prototype.add_alignments_1 );
}



function run_catboost_wordmap_test_2(){
    run_catboost_test_with_alignment_adding_method( "2h", CatBoostWordMap.prototype.add_alignments_2 );
}


//This uses catboost but gathers the statistics
//with the alignments added first.
function run_catboost_wordmap_test_3(){    
    run_catboost_test_with_alignment_adding_method( "3h", CatBoostWordMap.prototype.add_alignments_3 );
}


function run_catboost_wordmap_test_4(){
    run_catboost_test_with_alignment_adding_method( "4h", CatBoostWordMap.prototype.add_alignments_4 );
}

if (require.main === module) {
    //run_plane_wordmap_test();
    run_catboost_wordmap_test_1();
    run_catboost_wordmap_test_2();
    run_catboost_wordmap_test_3();
    run_catboost_wordmap_test_4();
}