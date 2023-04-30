 import {recursive_json_load, saveJson} from "./json_tools";
import {ChapterVerse, add_book_alignment_to_wordmap, extract_alignment_frequency, compile_verse_text_pair,
    convert_tc_to_token_dict} from "./wordmap_tools";
import WordMap from "wordmap";


if (require.main === module) {

    const loaded_alignment = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/.apps/translationCore/alignmentData/mat")

    //here is matthew
    const mat_english  = recursive_json_load( "/home/lansford/translationCore/projects/en_ult_mat_book/mat" );
    const mat_greek    = recursive_json_load( "/home/lansford/work2/Mission_Mutual/translationCore/tcResources/el-x-koine/bibles/ugnt/v0.30_Door43-Catalog/books.zip" ).mat

    const mat_0_14 = Object.fromEntries( Object.entries( mat_english).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) <= 14 ) );
    const mat_gt_14 = Object.fromEntries( Object.entries( mat_english).filter(([key, value]) => !isNaN(Number(key)) && parseInt(key) > 14 ) );


    const map = new WordMap({ targetNgramLength: 5, warnings: false });
    add_book_alignment_to_wordmap( mat_0_14, loaded_alignment, map);


    const converted_mat_0_14 = convert_tc_to_token_dict( "mat", mat_0_14, false );
    const converted_mat_greek = convert_tc_to_token_dict( "mat", mat_greek, true );


    //run_normal_wordmap_predictions( mat_gt_14, mat_gt_14, map );


    console.log( "done" );
}