

export interface JsonDict {
    [key: string]: any;
}

/**
 * Generates a dictionary of lists from an array of objects.
 *
 * @param {Object[]} list - The list of objects.
 * @return {Object} The dictionary of lists.
 */
export function listToDictOfLists(list: { [key: string]: number | string }[]): { [key: string]: (number | string)[] } {
    const dict: { [key: string]: (number | string)[] } = {};

    for (const item of list) {
        for (const key in item) {
            if (key in item) {
                if (!(key in dict)) {
                    dict[key] = [];
                }
                dict[key].push(item[key]);
            }
        }
    }

    return dict;
}
