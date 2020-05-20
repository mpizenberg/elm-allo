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
import Json.Encode as Encode exposing (Value)
import Layout2D
import Set exposing (Set)
import UI


port resize : ({ width : Float, height : Float } -> msg) -> Sub msg


port hideShow : Bool -> Cmd msg


port requestFullscreen : () -> Cmd msg


port exitFullscreen : () -> Cmd msg



-- WebRTC ports


port readyForLocalStream : String -> Cmd msg


port newStream : ({ id : Int, stream : Value } -> msg) -> Sub msg


port updateStream : { id : Int, stream : Value } -> Cmd msg


port remoteDisconnected : (Int -> msg) -> Sub msg


port joinCall : () -> Cmd msg


port leaveCall : () -> Cmd msg


port mute : Bool -> Cmd msg


port hide : Bool -> Cmd msg



-- Main


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
    , remotePeers : Set Int
    }


type Msg
    = Resize { width : Float, height : Float }
    | SetMic Bool
    | SetCam Bool
    | SetJoined Bool
    | NewPeer
    | LoosePeer
      -- WebRTC messages
    | NewStream { id : Int, stream : Value }
    | RemoteDisconnected Int


init : Flags -> ( Model, Cmd Msg )
init { width, height } =
    ( { width = width
      , height = height
      , mic = True
      , cam = True
      , joined = False
      , device =
            Element.classifyDevice
                { width = round width, height = round height }
      , nbPeers = 0
      , remotePeers = Set.empty
      }
    , readyForLocalStream "localVideo"
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
            , mute mic
            )

        SetCam cam ->
            ( { model | cam = cam }
            , hide cam
            )

        SetJoined joined ->
            ( { model | joined = joined, remotePeers = Set.empty }
            , if joined then
                Cmd.batch [ requestFullscreen (), joinCall () ]

              else
                Cmd.batch [ exitFullscreen (), leaveCall () ]
            )

        NewPeer ->
            ( { model | nbPeers = model.nbPeers + 1 }
            , Cmd.none
            )

        LoosePeer ->
            ( { model | nbPeers = max 0 (model.nbPeers - 1) }
            , Cmd.none
            )

        -- WebRTC messages
        NewStream { id, stream } ->
            ( { model | remotePeers = Set.insert id model.remotePeers }
            , updateStream { id = id, stream = stream }
            )

        RemoteDisconnected id ->
            ( { model | remotePeers = Set.remove id model.remotePeers }
            , Cmd.none
            )


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ resize Resize
        , newStream NewStream
        , remoteDisconnected RemoteDisconnected
        ]



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

            -- , Input.button [] { onPress = Just LoosePeer, label = Element.text "--" }
            , micControl model.device model.mic
            , filler
            , camControl model.device model.cam

            -- , Input.button [] { onPress = Just NewPeer, label = Element.text "++" }
            , Element.text <| String.fromInt <| Set.size model.remotePeers
            , filler
            ]
        , Element.html <|
            videoStreams model.width availableHeight model.joined model.remotePeers
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
        (Element.text "")



-- Video element


videoStreams : Float -> Float -> Bool -> Set Int -> Html Msg
videoStreams width height joined remotePeers =
    if not joined then
        -- Dedicated layout when we are not connected yet
        Html.Keyed.node "div"
            [ HA.style "display" "flex"
            , HA.style "height" (String.fromFloat height ++ "px")
            , HA.style "width" "100%"
            ]
            [ ( "localVideo", video "" "localVideo" )
            , ( "joinButton", joinButton )
            ]

    else if Set.size remotePeers <= 1 then
        -- Dedicated layout for 1-1 conversation
        let
            thumbHeight =
                max (toFloat UI.minVideoHeight) (height / 4)
                    |> String.fromFloat
        in
        Html.Keyed.node "div"
            [ HA.style "width" "100%"
            , HA.style "height" (String.fromFloat height ++ "px")
            , HA.style "position" "relative"
            ]
            (if Set.isEmpty remotePeers then
                [ ( "localVideo", thumbVideo thumbHeight "" "localVideo" )
                , ( "leaveButton", leaveButton 0 )
                ]

             else
                let
                    remotePeerId =
                        List.head (Set.toList remotePeers)
                            |> Maybe.withDefault -1
                            |> String.fromInt
                in
                [ ( "localVideo", thumbVideo thumbHeight "" "localVideo" )
                , ( remotePeerId, remoteVideo width height "" remotePeerId )
                , ( "leaveButton", leaveButton height )
                ]
            )

    else
        -- We use a grid layout if more than 1 peer
        let
            ( ( nbCols, nbRows ), ( cellWidth, cellHeight ) ) =
                Layout2D.fixedGrid width height (3 / 2) (Set.size remotePeers + 1)

            remoteVideos =
                Set.toList remotePeers
                    |> List.map
                        (\id ->
                            ( String.fromInt id
                            , gridVideoItem False "" (String.fromInt id)
                            )
                        )

            localVideo =
                ( "localVideo", gridVideoItem True "" "localVideo" )

            allVideos =
                remoteVideos ++ [ localVideo ]
        in
        videosGrid height cellWidth cellHeight nbCols nbRows allVideos


videosGrid : Float -> Float -> Float -> Int -> Int -> List ( String, Html Msg ) -> Html Msg
videosGrid height cellWidthNoSpace cellHeightNoSpace cols rows videos =
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
    Html.Keyed.node "div"
        [ HA.style "width" "100%"
        , HA.style "height" (String.fromFloat height ++ "px")
        , HA.style "position" "relative"
        , HA.style "display" "grid"
        , HA.style "grid-template-columns" gridWidth
        , HA.style "grid-template-rows" gridHeight
        , HA.style "justify-content" "space-evenly"
        , HA.style "align-content" "start"
        , HA.style "column-gap" (String.fromInt UI.spacing ++ "px")
        , HA.style "row-gap" (String.fromInt UI.spacing ++ "px")
        ]
        (videos ++ [ ( "leaveButton", leaveButton 0 ) ])


gridVideoItem : Bool -> String -> String -> Html msg
gridVideoItem muted src id =
    Html.video
        [ HA.id id
        , HA.autoplay True
        , HA.loop True
        , HA.property "muted" (Encode.bool muted)
        , HA.attribute "playsinline" "playsinline"

        -- prevent focus outline
        , HA.style "outline" "none"

        -- grow and center video
        , HA.style "justify-self" "stretch"
        , HA.style "align-self" "stretch"
        ]
        [ Html.source [ HA.src src, HA.type_ "video/mp4" ] [] ]


remoteVideo : Float -> Float -> String -> String -> Html msg
remoteVideo width height src id =
    Html.video
        [ HA.id id
        , HA.autoplay True
        , HA.loop True
        , HA.property "muted" (Encode.bool False)
        , HA.attribute "playsinline" "playsinline"

        -- prevent focus outline
        , HA.style "outline" "none"

        -- grow and center video
        , HA.style "max-height" (String.fromFloat height ++ "px")
        , HA.style "height" (String.fromFloat height ++ "px")
        , HA.style "max-width" (String.fromFloat width ++ "px")
        , HA.style "width" (String.fromFloat width ++ "px")
        , HA.style "position" "relative"
        , HA.style "left" "50%"
        , HA.style "bottom" "50%"
        , HA.style "transform" "translate(-50%, 50%)"
        , HA.style "z-index" "-1"
        ]
        [ Html.source [ HA.src src, HA.type_ "video/mp4" ] [] ]


thumbVideo : String -> String -> String -> Html msg
thumbVideo height src id =
    Html.video
        [ HA.id id
        , HA.autoplay True
        , HA.loop True
        , HA.property "muted" (Encode.bool True)
        , HA.attribute "playsinline" "playsinline"

        -- prevent focus outline
        , HA.style "outline" "none"

        -- grow and center video
        , HA.style "position" "absolute"
        , HA.style "bottom" "0"
        , HA.style "right" "0"
        , HA.style "max-width" "100%"
        , HA.style "max-height" (height ++ "px")
        , HA.style "height" (height ++ "px")
        , HA.style "margin" (String.fromInt UI.spacing ++ "px")
        ]
        [ Html.source [ HA.src src, HA.type_ "video/mp4" ] [] ]


video : String -> String -> Html msg
video src id =
    Html.video
        [ HA.id id
        , HA.autoplay True
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


joinButton : Html Msg
joinButton =
    Element.layoutWith
        { options = [ Element.noStaticStyleSheet ] }
        [ Element.htmlAttribute <| HA.style "position" "absolute"
        , Element.htmlAttribute <| HA.style "z-index" "1"
        ]
        (Input.button
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
        )


leaveButton : Float -> Html Msg
leaveButton height =
    Element.layoutWith
        { options = [ Element.noStaticStyleSheet ] }
        [ Element.width Element.fill
        , Element.height Element.fill
        , Element.htmlAttribute <| HA.style "position" "absolute"
        , Element.htmlAttribute <|
            HA.style "transform" ("translateY(-" ++ String.fromFloat height ++ "px)")
        ]
        (Input.button
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
        )
