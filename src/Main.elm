port module Main exposing (main)

import Browser
import Element exposing (Device, Element)
import Element.Background as Background
import Element.Border as Border
import Element.Font as Font
import Element.Input as Input
import Element.Keyed as Keyed
import FeatherIcons as Icon
import Html exposing (Html)
import Html.Attributes as HA
import Html.Keyed
import Json.Encode as Encode
import Layout2D
import UI


port resize : ({ width : Float, height : Float } -> msg) -> Sub msg


port hideShow : Bool -> Cmd msg


main : Program Flags Model Msg
main =
    Browser.element
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }


type alias Flags =
    { width : Float, height : Float }


type alias Model =
    { width : Float
    , height : Float
    , mic : Bool
    , cam : Bool
    , joined : Bool
    , device : Element.Device
    , nbPeers : Int
    }


type Msg
    = Resize { width : Float, height : Float }
    | SetMic Bool
    | SetCam Bool
    | SetJoined Bool
    | NewPeer
    | LoosePeer


init : Flags -> ( Model, Cmd Msg )
init { width, height } =
    ( { width = width
      , height = height
      , mic = True
      , cam = True
      , joined = True
      , device =
            Element.classifyDevice
                { width = round width, height = round height }
      , nbPeers = 0
      }
    , Cmd.none
    )


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Resize { width, height } ->
            ( { model
                | width = width
                , height = height
                , device =
                    Element.classifyDevice
                        { width = round width, height = round height }
              }
            , Cmd.none
            )

        SetMic mic ->
            ( { model | mic = mic }
            , Cmd.none
            )

        SetCam cam ->
            ( { model | cam = cam }
            , hideShow cam
            )

        SetJoined joined ->
            ( { model | joined = joined }
            , Cmd.none
            )

        NewPeer ->
            ( { model | nbPeers = model.nbPeers + 1 }
            , Cmd.none
            )

        LoosePeer ->
            ( { model | nbPeers = max 0 (model.nbPeers - 1) }
            , Cmd.none
            )


subscriptions : Model -> Sub Msg
subscriptions model =
    resize Resize



-- View


view : Model -> Html Msg
view model =
    Element.layout
        [ Background.color UI.darkGrey
        , Font.color UI.lightGrey
        , Element.width Element.fill
        , Element.height Element.fill
        , Element.clip
        ]
        (layout model)


layout : Model -> Element Msg
layout model =
    let
        availableHeight =
            model.height
                - UI.controlButtonSize model.device.class
                - (2 * toFloat UI.spacing)
    in
    Element.column
        [ Element.width Element.fill
        , Element.height Element.fill
        ]
        [ Element.row [ Element.padding UI.spacing, Element.width Element.fill ]
            [ filler
            , Input.button [] { onPress = Just LoosePeer, label = Element.text "--" }
            , micControl model.device model.mic
            , filler
            , camControl model.device model.cam
            , Input.button [] { onPress = Just NewPeer, label = Element.text "++" }
            , filler
            ]
        , videoStreams model.width availableHeight model.joined model.nbPeers
        ]


micControl : Device -> Bool -> Element Msg
micControl device micOn =
    Element.row [ Element.spacing UI.spacing ]
        [ Icon.micOff
            |> Icon.withSize (UI.controlButtonSize device.class)
            |> Icon.toHtml []
            |> Element.html
            |> Element.el []
        , toggle SetMic micOn (UI.controlButtonSize device.class)
        , Icon.mic
            |> Icon.withSize (UI.controlButtonSize device.class)
            |> Icon.toHtml []
            |> Element.html
            |> Element.el []
        ]


camControl : Device -> Bool -> Element Msg
camControl device camOn =
    Element.row [ Element.spacing UI.spacing ]
        [ Icon.videoOff
            |> Icon.withSize (UI.controlButtonSize device.class)
            |> Icon.toHtml []
            |> Element.html
            |> Element.el []
        , toggle SetCam camOn (UI.controlButtonSize device.class)
        , Icon.video
            |> Icon.withSize (UI.controlButtonSize device.class)
            |> Icon.toHtml []
            |> Element.html
            |> Element.el []
        ]


filler : Element msg
filler =
    Element.el [ Element.width Element.fill ] Element.none



-- Toggle


toggle : (Bool -> Msg) -> Bool -> Float -> Element Msg
toggle msg checked height =
    Input.checkbox [] <|
        { onChange = msg
        , label = Input.labelHidden "Activer/Désactiver"
        , checked = checked
        , icon =
            toggleCheckboxWidget
                { offColor = UI.lightGrey
                , onColor = UI.green
                , sliderColor = UI.white
                , toggleWidth = 2 * round height
                , toggleHeight = round height
                }
        }


toggleCheckboxWidget : { offColor : Element.Color, onColor : Element.Color, sliderColor : Element.Color, toggleWidth : Int, toggleHeight : Int } -> Bool -> Element msg
toggleCheckboxWidget { offColor, onColor, sliderColor, toggleWidth, toggleHeight } checked =
    let
        pad =
            3

        sliderSize =
            toggleHeight - 2 * pad

        translation =
            (toggleWidth - sliderSize - pad)
                |> String.fromInt
    in
    Element.el
        [ Background.color <|
            if checked then
                onColor

            else
                offColor
        , Element.width <| Element.px <| toggleWidth
        , Element.height <| Element.px <| toggleHeight
        , Border.rounded (toggleHeight // 2)
        , Element.inFront <|
            Element.el [ Element.height Element.fill ] <|
                Element.el
                    [ Background.color sliderColor
                    , Border.rounded <| sliderSize // 2
                    , Element.width <| Element.px <| sliderSize
                    , Element.height <| Element.px <| sliderSize
                    , Element.centerY
                    , Element.moveRight pad
                    , Element.htmlAttribute <|
                        HA.style "transition" ".4s"
                    , Element.htmlAttribute <|
                        if checked then
                            HA.style "transform" <| "translateX(" ++ translation ++ "px)"

                        else
                            HA.class ""
                    ]
                    (Element.text "")
        ]
    <|
        Element.text ""



-- Video element


videoStreams : Float -> Float -> Bool -> Int -> Element Msg
videoStreams width height joined nbPeers =
    if not joined then
        -- Dedicated layout when we are not connected yet
        Keyed.el
            [ Element.width Element.fill
            , Element.fill
                |> Element.maximum (round height)
                |> Element.minimum UI.minVideoHeight
                |> Element.height
            , Element.htmlAttribute <| HA.id "streams"
            , Element.inFront joinButton
            ]
            ( "streams"
            , Element.html <|
                Html.Keyed.node "div"
                    [ HA.style "display" "flex"
                    , HA.style "flex" "1 1 auto"
                    , HA.style "max-width" "100%"
                    , HA.style "max-height" "100%"
                    ]
                    [ ( "localVideo", video "local.mp4" "localVideo" ) ]
            )

    else if nbPeers <= 1 then
        -- Dedicated layout for 1-1 conversation
        let
            localVideoHeight =
                max (toFloat UI.minVideoHeight) (height / 4)
                    |> String.fromFloat
        in
        Keyed.el
            [ Element.width Element.fill
            , Element.fill
                |> Element.maximum (round height)
                |> Element.minimum UI.minVideoHeight
                |> Element.height
            , Element.htmlAttribute <| HA.id "streams"
            , Element.htmlAttribute <| HA.style "justify-content" "flex-end"
            , Element.padding UI.spacing
            , Element.inFront leaveButton
            , Element.behindContent <|
                if nbPeers == 0 then
                    Element.none

                else
                    -- I can't figure out how to keep this from getting
                    -- destroyed by the virtual DOM.
                    Element.html <|
                        -- The "Keyed" node needs to be at the Html level
                        -- to match with the Grid case when more peers
                        Html.Keyed.node "div"
                            [ HA.style "display" "flex"
                            , HA.style "max-height" "100%"
                            , HA.id "tototo"
                            ]
                            [ ( "1", video "remote.mp4" "1" )
                            ]
            ]
            ( "streams"
            , Element.html <|
                Html.Keyed.node "div"
                    [ HA.style "height" (localVideoHeight ++ "px")
                    , HA.style "display" "flex"
                    , HA.style "flex-direction" "column"
                    , HA.style "align-items" "flex-end"
                    , HA.style "z-index" "0"
                    ]
                    [ ( "localVideo", thumbVideo "local.mp4" "localVideo" )
                    ]
            )

    else
        -- We use a grid layout if more than 1 peer
        let
            ( ( nbCols, nbRows ), ( cellWidth, cellHeight ) ) =
                Layout2D.fixedGrid width height (3 / 2) (nbPeers + 1)

            remoteVideos =
                List.range 1 nbPeers
                    |> List.map
                        (\id ->
                            ( String.fromInt id
                            , gridVideoItem "remote.mp4" (String.fromInt id)
                            )
                        )

            localVideo =
                ( "localVideo", gridVideoItem "local.mp4" "localVideo" )

            allVideos =
                remoteVideos ++ [ localVideo ]
        in
        Keyed.el
            [ Element.width Element.fill
            , Element.height Element.fill
            , Element.inFront leaveButton
            , Element.htmlAttribute <| HA.id "streams"
            ]
            ( "streams", videosGrid cellWidth cellHeight nbCols nbRows allVideos )


videosGrid : Float -> Float -> Int -> Int -> List ( String, Html msg ) -> Element msg
videosGrid cellWidthNoSpace cellHeightNoSpace cols rows videos =
    let
        cellWidth =
            cellWidthNoSpace - toFloat (cols - 1) / toFloat cols * toFloat UI.spacing

        cellHeight =
            cellHeightNoSpace - toFloat (rows - 1) / toFloat rows * toFloat UI.spacing

        gridWidth =
            List.repeat cols (String.fromFloat cellWidth ++ "px")
                |> String.join " "

        gridHeight =
            List.repeat rows (String.fromFloat cellHeight ++ "px")
                |> String.join " "
    in
    Element.html <|
        Html.Keyed.node "div"
            [ HA.style "flex-grow" "1"
            , HA.style "display" "grid"
            , HA.style "grid-template-columns" gridWidth
            , HA.style "grid-template-rows" gridHeight
            , HA.style "justify-content" "space-evenly"
            , HA.style "align-content" "start"
            , HA.style "column-gap" (String.fromInt UI.spacing ++ "px")
            , HA.style "row-gap" (String.fromInt UI.spacing ++ "px")
            ]
            videos


gridVideoItem : String -> String -> Html msg
gridVideoItem src id =
    Html.video
        [ HA.id id
        , HA.autoplay False
        , HA.loop True
        , HA.property "muted" (Encode.bool True)
        , HA.attribute "playsinline" "playsinline"

        -- prevent focus outline
        , HA.style "outline" "none"

        -- grow and center video
        , HA.style "justify-self" "stretch"
        , HA.style "align-self" "stretch"
        ]
        [ Html.source [ HA.src src, HA.type_ "video/mp4" ] [] ]


thumbVideo : String -> String -> Html msg
thumbVideo src id =
    Html.video
        [ HA.id id
        , HA.autoplay False
        , HA.loop True
        , HA.property "muted" (Encode.bool True)
        , HA.attribute "playsinline" "playsinline"

        -- prevent focus outline
        , HA.style "outline" "none"

        -- grow and center video
        , HA.style "flex-grow" "1"
        , HA.style "height" "100%"
        , HA.style "max-width" "100%"
        ]
        [ Html.source [ HA.src src, HA.type_ "video/mp4" ] [] ]


video : String -> String -> Html msg
video src id =
    Html.video
        [ HA.id id
        , HA.autoplay False
        , HA.loop True
        , HA.property "muted" (Encode.bool True)
        , HA.attribute "playsinline" "playsinline"

        -- prevent focus outline
        , HA.style "outline" "none"

        -- grow and center video
        , HA.style "flex" "1 1 auto"
        , HA.style "max-height" "100%"
        , HA.style "max-width" "100%"
        ]
        [ Html.source [ HA.src src, HA.type_ "video/mp4" ] [] ]


joinButton : Element Msg
joinButton =
    Input.button
        [ Element.centerX
        , Element.centerY
        , Element.htmlAttribute <| HA.style "outline" "none"
        ]
        { onPress = Just (SetJoined True)
        , label =
            Element.el
                [ Background.color UI.green
                , Element.htmlAttribute <| HA.style "outline" "none"
                , Element.width <| Element.px UI.joinButtonSize
                , Element.height <| Element.px UI.joinButtonSize
                , Border.rounded <| UI.joinButtonSize // 2
                , Border.shadow
                    { offset = ( 0, 0 )
                    , size = 0
                    , blur = UI.joinButtonBlur
                    , color = UI.black
                    }
                , Font.color UI.white
                ]
                (Icon.phone
                    |> Icon.withSize (toFloat UI.joinButtonSize / 2)
                    |> Icon.toHtml []
                    |> Element.html
                    |> Element.el [ Element.centerX, Element.centerY ]
                )
        }


leaveButton : Element Msg
leaveButton =
    Input.button
        [ Element.centerX
        , Element.alignBottom
        , Element.padding <| 3 * UI.spacing
        , Element.htmlAttribute <| HA.style "outline" "none"
        ]
        { onPress = Just (SetJoined False)
        , label =
            Element.el
                [ Background.color UI.red
                , Element.htmlAttribute <| HA.style "outline" "none"
                , Element.width <| Element.px UI.leaveButtonSize
                , Element.height <| Element.px UI.leaveButtonSize
                , Border.rounded <| UI.leaveButtonSize // 2
                , Border.shadow
                    { offset = ( 0, 0 )
                    , size = 0
                    , blur = UI.joinButtonBlur
                    , color = UI.black
                    }
                , Font.color UI.white
                ]
                (Icon.phoneOff
                    |> Icon.withSize (toFloat UI.leaveButtonSize / 2)
                    |> Icon.toHtml []
                    |> Element.html
                    |> Element.el [ Element.centerX, Element.centerY ]
                )
        }
