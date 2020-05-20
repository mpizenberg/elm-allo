module Layout2D exposing (fixedGrid)

{-| Some layout strategies to place participants
-}


{-| Given an available space of size width x height,
a fixed aspect ratio of the blocks to position and their number,
return the most appropriate number of columns and rows.
-}
fixedGrid : Float -> Float -> Float -> Int -> ( ( Int, Int ), ( Float, Float ) )
fixedGrid width height ratio n =
    let
        horizontalScore =
            fixedScore width height ratio n 1 n

        ( columns, rows, cellWidth ) =
            fixedGridRec width height ratio n ( n, 1, horizontalScore )
    in
    ( ( columns, rows ), ( cellWidth, cellWidth / ratio ) )


fixedGridRec : Float -> Float -> Float -> Int -> ( Int, Int, Float ) -> ( Int, Int, Float )
fixedGridRec width height ratio n ( c, r, score ) =
    if c <= 1 then
        ( c, r, score )

    else
        let
            c_ =
                c - 1

            r_ =
                if modBy c_ n == 0 then
                    n // c_

                else
                    n // c_ + 1

            score_ =
                fixedScore width height ratio c_ r_ n
        in
        if score_ > score then
            fixedGridRec width height ratio n ( c_, r_, score_ )

        else
            ( c, r, score )


{-| The score corresponds to the width of one tile.
-}
fixedScore : Float -> Float -> Float -> Int -> Int -> Int -> Float
fixedScore width height ratio columns rows n =
    -- If the current config is wider than available space
    if ratio * toFloat columns / toFloat rows > width / height then
        width / toFloat columns

    else
        ratio * height / toFloat rows
