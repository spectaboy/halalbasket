// @ts-nocheck
import React from 'react';
import {View,Text} from 'react-native';
import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';
import iconFont from '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf';
export function useFonts(fonts){const [ready,setReady]=React.useState(false);React.useEffect(()=>{Promise.all(Object.entries({...fonts,Ionicons:iconFont}).map(async([name,source])=>{const face=new FontFace(name,`url(${source})`);await face.load();document.fonts.add(face)})).then(()=>setReady(true))},[]);return [ready,null]}
export function Ionicons({name,size,color,style,...props}){return <Text {...props} style={[{fontFamily:'Ionicons',fontSize:size,color},style]}>{String.fromCodePoint(glyphs[name]||glyphs['ellipse-outline'])}</Text>}
Ionicons.glyphMap=glyphs;
export function LinearGradient({colors,locations,style,children,...props}){return <View {...props} style={[style,{backgroundImage:`linear-gradient(to bottom, ${colors.map((color,i)=>color+(locations?` ${locations[i]*100}%`:'')).join(',')})`}]}>{children}</View>}
export const useSafeAreaInsets=()=>({top:24,bottom:16,left:0,right:0});
export function SafeAreaProvider({children}){return <View style={{flex:1}}>{children}</View>}
export function SafeAreaView({children,edges=['top','bottom'],style,...props}){return <View {...props} style={[{paddingTop:edges.includes('top')?24:0,paddingBottom:edges.includes('bottom')?16:0},style]}>{children}</View>}
