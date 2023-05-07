 import {recursive_json_load, saveJson} from "./json_tools";
import {ChapterVerse, add_book_alignment_to_wordmap, extract_alignment_frequency, compile_verse_text_pair,
    convert_tc_to_token_dict, convert_alignment_to_alignment_dict, grade_mapping_method,
    word_map_predict_tokens} from "./wordmap_tools";
import WordMap, {Suggestion} from "wordmap";
import { createWriteStream } from 'fs';
import {Token} from "wordmap-lexer";


if (require.main === module) {

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
    const converted_alignment = convert_alignment_to_alignment_dict( "mat", loaded_alignment, converted_mat_greek, converted_mat_gt_c14);


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
        converted_alignment, //manual_mappings_dict
        mat_split_plane_csv, //output_stream
         plane_wordmap_method //mapping_function
        )
    mat_split_plane_csv.end();


    console.log( "done" );
}