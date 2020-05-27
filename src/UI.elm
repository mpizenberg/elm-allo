module UI exposing (..)

import Element



-- Layout


spacing : Int
spacing =
    10


minVideoHeight : Int
minVideoHeight =
    120


controlButtonSize : Element.DeviceClass -> Float
controlButtonSize deviceClass =
    case deviceClass of
        Element.Phone ->
            28

        _ ->
            48


joinButtonSize : Int
joinButtonSize =
    100


leaveButtonSize : Int
leaveButtonSize =
    80


copyButtonSize : Int
copyButtonSize =
    48


joinButtonBlur : Float
joinButtonBlur =
    10



-- Color


lightGrey : Element.Color
lightGrey =
    Element.rgb255 187 187 187


darkGrey : Element.Color
darkGrey =
    Element.rgb255 50 50 50


green : Element.Color
green =
    Element.rgb255 39 203 139


red : Element.Color
red =
    Element.rgb255 203 60 60


darkRed : Element.Color
darkRed =
    Element.rgb255 70 20 20


white : Element.Color
white =
    Element.rgb255 255 255 255


black : Element.Color
black =
    Element.rgb255 0 0 0
