let range = (n: number, offset: number) =>
  Array.from(Array(n).keys()).map((n) => n + offset);

class TreeLeaf {
    private average: number;

    constructor(average: number) {
        this.average = average;
    }

    predict(xyData: any): number {
        return this.average;
    }

    predict_single(data: {[key: number]:any}): number {
        return this.average;
    }

}

const MIDDLE_SPLIT_FAVOR: number = 0.25;

interface TreeBranch__random_tree__NamedParameters{
    xy_data: {[key: string]: number}[], 
    num_levels: number,
    y_index: string,
    ignored_categories: string[]
}

class TreeBranch {
    private left_side: TreeBranch | TreeLeaf | null;
    private right_side: TreeBranch | TreeLeaf | null;
    public feature_index: string | null;
    public split_value: any | null;

    constructor() {
        this.left_side = null;
        this.right_side = null;
        this.feature_index = null;
        this.split_value = null;
    }

    predict_single( data: {[key: string]:number}): number {
        return (data[this.feature_index] > this.split_value)?
                    this.right_side.predict_single(data):
                    this.left_side.predict_single(data);
    }

    predict(xy_data: {[key: string]: number}[]): number[] {
        return xy_data.map( row => this.predict_single(row) );
    }

    random_tree({
        xy_data,
        num_levels,
        y_index,
        ignored_categories
    }:TreeBranch__random_tree__NamedParameters ): TreeBranch {
        //assuming the keys on the first object are representative.
        const categories = Object.keys(xy_data[0]).filter(
            (category) => category !== y_index && !ignored_categories.includes(category)
        );
        //Randomly select a category
        const randomCategoryIndex = Math.floor(Math.random() * categories.length);
        this.feature_index = categories[randomCategoryIndex];

        const length = xy_data.length;
        const first_of_right_hand = Math.min(
            Math.max(Math.floor(Math.random() * length), 1),
            length - 1
        );

        // Sort the section by the selected feature index
        const xy_data_sorted = xy_data.slice();
        xy_data_sorted.sort( (a,b) => a[this.feature_index]-b[this.feature_index]);


        //determine our split value from the randomly hit split location.
        this.split_value =
            0.5 *
            (xy_data_sorted[first_of_right_hand - 1][this.feature_index] +
             xy_data_sorted[first_of_right_hand][this.feature_index]);

        if (num_levels > 1) {
            if (first_of_right_hand > 1) {
                this.left_side = new TreeBranch().random_tree({
                    ignored_categories: [],
                    xy_data:xy_data_sorted.slice(0,first_of_right_hand),
                    num_levels: num_levels - 1,
                    y_index,
                });
            } else {
                this.left_side = new TreeLeaf(
                    //compute average of y_index of left hand side.
                    xy_data_sorted.slice( 0, first_of_right_hand ).map( row => row[y_index] ).reduce((sum,current) => sum+current,0)/length
                );
            }

            if (length - first_of_right_hand > 1) {
                this.right_side = new TreeBranch().random_tree({
                    ignored_categories: [],
                    xy_data:xy_data_sorted.slice(first_of_right_hand,length),
                    num_levels: num_levels - 1,
                    y_index
                });
            } else {
                this.right_side = new TreeLeaf(
                    //compute average of y_index of right handn side.
                    xy_data_sorted.slice( first_of_right_hand, length ).map( row => row[y_index] ).reduce((sum,current) => sum+current,0)/length
                );
            }
        } else {
            this.left_side = new TreeLeaf(
                //compute average of y_index of left hand side.
                xy_data_sorted.slice( 0, first_of_right_hand ).map( row => row[y_index] ).reduce((sum,current) => sum+current,0)/length
            );
            this.right_side = new TreeLeaf(
                //compute average of y_index of right handn side.
                xy_data_sorted.slice( first_of_right_hand, length ).map( row => row[y_index] ).reduce((sum,current) => sum+current,0)/length
            );
        }

        return this;
    }
}

interface JLBoost__train__NamedParamaters {
    xy_data: {[key: string]: number}[], // Replace 'any' with the appropriate type for xy_data
    y_index: string,
    n_steps: number,
    tree_depth: number,
    talk: boolean,
}
export class JLBoost {
    trees: TreeBranch[];
    learning_rate: number;

    constructor(learning_rate = 0.07) {
        this.trees = [];
        this.learning_rate = learning_rate;
    }

    predict(xy_data: {[key: string]: number}[] ): any {
        let output: any = Array(xy_data.length).fill(0);

        for (const tree of this.trees) {
            const treePrediction = tree.predict(xy_data)
            output = output.map((value: number, index: number) => {
                return value + treePrediction[index] * this.learning_rate;
            });
        }
        return output;
    }

    predict_single( data: {[key: string]:number} ): number{
        let output: number = 0;

        for( const tree of this.trees){
            const treePrediction = tree.predict_single( data )
            output += treePrediction * this.learning_rate;
        }

        return output;
    }


    train({
        xy_data,
        y_index = 'y',
        n_steps = 1000,
        tree_depth = 2,
        talk = true,
    }: JLBoost__train__NamedParamaters ): JLBoost {
        let current_output = this.predict(xy_data);

        //Drop all features which don't do anything.
        let featuresToDrop : string[] = [];
        for( const feature of Object.keys(xy_data[0]) ){
            const max_value = xy_data.reduce((max,current) => {
                return current[feature] > max ? current[feature] : max;
            }, Number.MIN_SAFE_INTEGER);
            const min_value = xy_data.reduce((min,current) => {
                return current[feature] < min ? current[feature] : min;
            }, Number.MAX_SAFE_INTEGER);

            //if( feature_data.max() == feature_data.min() ){
            if( max_value == min_value ){
                featuresToDrop.push( feature );
                if(talk){
                    console.log( `Dropping constant feature ${feature}` );
                }
            }
        }
        xy_data = xy_data.map( row => Object.fromEntries(Object.entries(row).filter(([feature,value]) => !(feature in featuresToDrop))));

        let ignored_categories: string[] = [];
        let last_loss: number | null = null;

        for (let n = 0; n < n_steps; n++) {

            const adjusted_data = xy_data.map( (row, row_n) => {
                return {
                    ...row,
                    [y_index]: row[y_index] - current_output[row_n]
                }
            })

            const new_tree = new TreeBranch();
            new_tree.random_tree({
                num_levels: tree_depth,
                ignored_categories: ignored_categories,
                xy_data: adjusted_data,
                y_index: y_index
            });

            const new_tree_output = new_tree.predict( xy_data );
            const new_output: number[] = current_output.map((value: number, index: number) => {
                return value + new_tree_output[index] * this.learning_rate;
            });

            //const new_loss = Math.stdDev(xy_data[y_index] - new_output);
            const error : number[] = xy_data.map( (row,row_n) => new_output[row_n] - row[y_index] );
            const error_sum : number = error.reduce( (sum,current) => sum+current, 0 );
            const error_mean = error_sum/error.length;
            const error_dist_squared = error.map( value => (value-error_mean)*(value-error_mean) ).reduce( (sum,current) => sum+current, 0 );
            const new_loss = Math.sqrt( error_dist_squared/error.length );

            ignored_categories = [new_tree.feature_index];

            if (last_loss === null || new_loss < last_loss) {
                this.trees.push(new_tree);
                last_loss = new_loss;
                current_output = new_output;

                if (talk) {
                    console.log(
                        `Step ${n}: Output  ${new_loss}  split on ${new_tree.feature_index} at ${new_tree.split_value}`
                    );
                }

            } else {
                if (talk) {
                    console.log(
                        `Step ${n}: Output [${new_loss}] split on ${new_tree.feature_index} at ${new_tree.split_value} --rejected`
                    );
                }
            }
        }
        return this;
    }
}

if (require.main === module) {
    //Do some tests of the module

    const test_dataframe = [
        { 'gender':0, 'age':2,  'y':0 },
        { 'gender':1, 'age':3,  'y':0 },
        { 'gender':0, 'age':6,  'y':0 },
        { 'gender':1, 'age':7,  'y':0 },
        { 'gender':1, 'age':9,  'y':0 },
        { 'gender':0, 'age':12, 'y':.1 },
        { 'gender':0, 'age':15, 'y':.3 },
        { 'gender':1, 'age':16, 'y':9 },
        { 'gender':0, 'age':16, 'y':1 },
        { 'gender':0, 'age':18, 'y':10 },
        { 'gender':1, 'age':18, 'y':8 },
        { 'gender':0, 'age':20, 'y':7 },
        { 'gender':0, 'age':21, 'y':7 },
        { 'gender':0, 'age':23, 'y':7 },
        { 'gender':1, 'age':26, 'y':4 },
        { 'gender':0, 'age':27, 'y':4 },
        { 'gender':1, 'age':29, 'y':2 },
        { 'gender':1, 'age':30, 'y':1 },
        { 'gender':0, 'age':40, 'y':1 },
        { 'gender':0, 'age':100, 'y':10 },
        { 'gender':1, 'age':100, 'y':9 },
    ];

    const model = new JLBoost();

    model.train( {xy_data: test_dataframe, y_index:'y', n_steps:3000, tree_depth:4, talk:true })

    const model_results = model.predict( test_dataframe );


    const with_prediction = test_dataframe.map( (row,row_n) => {
        return {
            ...row,
            prediction: model_results[row_n],
            diff: model_results[row_n]-row['y']
        }
    });

    console.table( with_prediction );
}