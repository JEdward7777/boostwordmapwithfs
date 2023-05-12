import sys, json, os
import pandas as pd
import sklearn
import sklearn.model_selection
from catboost import CatBoostRegressor, Pool

#pip install pandas
#pip install scikit-learn
#pip install catboost
#pip install traitlets

def rel_to_script( filename ):
    script_path = os.path.abspath(__file__)
    script_dir = os.path.dirname(script_path)
    return os.path.join(script_dir, filename)

def main():
    training_data_file = "./catboost_training_data.json"
    output_model_file = "./cat_boost_model.cbm"

    for arg in sys.argv:
        if arg.endswith( ".json" ):
            training_data_file = arg
        elif arg.endswith( ".cbm" ):
            output_model_file = arg

    with open( rel_to_script(training_data_file), "rt" ) as fin:
        json_data = json.load( fin )


    X = pd.DataFrame( json_data['training_data'], columns=json_data['catboost_feature_order']+json_data['catboost_cat_feature_order'] )
    y = pd.Series( json_data['training_data']['output'] )

    X_train, X_test, y_train, y_test = sklearn.model_selection.train_test_split(
        X,
        y,
        random_state=1,
    )
    X_train = X_train.reset_index(drop=True)
    X_test = X_test.reset_index(drop=True)
    y_train = y_train.reset_index(drop=True)
    y_test = y_test.reset_index(drop=True)

    #The cat features come after the number featuers
    #so the index of the cat features are an enumeration the length of the cat
    #features offset by the number of numerical features.
    cat_feature_indexes = []
    for i in range(len(json_data['catboost_cat_feature_order'])):
        cat_feature_indexes.append( i + len( json_data['catboost_feature_order'] ) )

    train_pool = Pool(
        data=X_train,
        label=y_train,
        cat_features=cat_feature_indexes
    )
    validation_pool = Pool(
        data=X_test,
        label=y_test,
        cat_features=cat_feature_indexes
    )

    cb_model = CatBoostRegressor(
        iterations=8000,
        #task_type="GPU",
        learning_rate=.03,
        cat_features=cat_feature_indexes
    )
    cb_model.fit(train_pool, eval_set=validation_pool, verbose=True)

    print( 'Model is fitted: {}',format(cb_model.is_fitted()))
    print('Model params:\n{}'.format(cb_model.get_params()))


    cb_model.save_model( rel_to_script( output_model_file ) )

    print( "saved" )

if __name__ == '__main__': main()