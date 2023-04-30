import * as fs from "fs-extra";
import * as AdmZip from 'adm-zip';
import * as path from 'path';


export interface JsonDict {
    [key: string]: any;
}



function load_json_zip(zip_path: string): JsonDict {
    const zip = new AdmZip(zip_path);
    const entries = zip.getEntries().filter(e => e.entryName.endsWith('.json'));
    const data: JsonDict = {};

    function load_json(file_data: Buffer): any {
        const file_content = file_data.toString('utf-8');
        return JSON.parse(file_content);
    }

    function stick_into_structure(dict: JsonDict, dict_path: string, content: any): void {
        const parts = dict_path.split('/');
        let current_dict = dict;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                current_dict[part] = content;
            } else {
                if (!(part in current_dict)) {
                    current_dict[part] = {};
                }
                current_dict = current_dict[part];
            }
        }
    }

    for (const entry of entries) {
        const file_data = zip.readFile(entry.entryName);
        const file_name = entry.entryName.replace(/\.json$/, '');
        stick_into_structure(data, file_name, load_json(file_data));
    }

    return data;
}


export function recursive_json_load(filepath: string): JsonDict {
    let contents: JsonDict = {};
    const ext = path.extname(filepath);
    
    if (fs.statSync(filepath).isDirectory()) {
        for (const sub_filename of fs.readdirSync(filepath)) {
            const sub_filepath = path.join( filepath, sub_filename);
            const recursive_result = recursive_json_load(sub_filepath);
            if( Object.keys(recursive_result).length > 0 ){
                const sub_ext = path.extname( sub_filename );
                let sub_key = sub_filename;
                if( [".json",".zip"].includes(sub_ext) ){
                    sub_key = path.basename(sub_filename,sub_ext);
                }
                contents[sub_key] = recursive_result;
            }
        }
    } else if (ext.toLowerCase() === '.zip') {
        contents = load_json_zip(filepath);
    } else if (ext.toLowerCase() === '.json') {
    const fileContents = fs.readFileSync(filepath, 'utf8');
        contents = JSON.parse(fileContents);
    }
    return contents;
}



export function saveJson(obj: object, path: string): void {
    const json = JSON.stringify(obj, null, 2);
    fs.writeFileSync(path, json);
}
  
