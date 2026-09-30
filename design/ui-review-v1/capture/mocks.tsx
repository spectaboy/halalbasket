// Isolated UI capture fixtures. This entry never contacts auth, payments or a database.
// @ts-nocheck
import React from 'react';
import {View,Text} from 'react-native';
const noop=()=>{};
const refresh=async()=>{};
const photo='/assets/onboarding/restaurant.png';
const now=new Date().toISOString();
export const user={id:'preview-user',first_name:'Mico',last_name:'Preview',email:'you@example.com',phone:'7805550100',role:'admin',is_admin:true,default_address:'12 Maple Road, Edmonton',avatar_url:null};
export const seller={id:'preview-seller',user_id:user.id,business_name:'Olive & Ember',seller_type:'restaurant',description:'Freshly prepared local favourites.',verification_status:'approved',permit_status:'approved',food_category_tier:'low_risk',is_open:true,banner_url:photo,logo_url:null,cuisine_tags:['Middle Eastern','Grill'],avg_rating:4.8,rating_count:126,commission_rate:0.15,address:'24 Market Street',location:null,prep_time_mins:25,accepts_realtime:true,accepts_scheduled:true,open_hours:{},created_at:now,users:user,user};
export const driver={id:'preview-driver',user_id:user.id,verification_status:'approved',vehicle_info:{make:'Toyota',model:'Corolla',year:'2024',color:'White'},is_online:false,users:user,user,created_at:now};
export const listing={id:'preview-listing',seller_id:seller.id,name:'Grilled chicken & saffron rice',description:'Flame-grilled chicken, fluffy saffron rice, herbs and a side of hummus.',price:18.5,image_url:photo,category:'Rice bowls',is_available:true,sold_out:false,is_low_risk:true,business_name:seller.business_name,seller_type:'restaurant',created_at:now};
const item={id:'preview-item',listing_id:listing.id,name:listing.name,unit_price:18.5,quantity:2};
export const order={id:'12345678-preview',customer_id:user.id,seller_id:seller.id,driver_id:driver.id,status:'preparing',delivery_address:user.default_address,delivery_location:null,subtotal:37,delivery_fee:3.99,service_fee:1.49,tax:1.85,total:44.33,commission_amount:5.55,commission_rate:.15,payment_status:'captured',placed_at:now,created_at:now,order_items:[item],sellers:seller,seller,users:user,customer:user,drivers:driver};
const windowRow={id:'preview-window',seller_id:seller.id,title:'Sunday family kitchen',cook_date:'2026-10-04',order_cutoff:'2026-10-03T20:00:00Z',pickup_ready_at:'2026-10-04T18:00:00Z',min_orders:5,status:'open',sellers:seller,pre_order_window_items:[{listings:listing}]};
function rows(table){return ({public_sellers:[seller,{...seller,id:'preview-cook',business_name:'Neighbourhood Kitchen',seller_type:'home_cook',banner_url:'/assets/onboarding/home-cooking.png'}],sellers:[seller],users:[user],drivers:[window.currentPreview==='DriverVerificationPending'?{...driver,verification_status:'pending'}:driver],listings:[listing],visible_listings:[listing],orders:[order],order_items:[item],pre_order_windows:[windowRow],pre_order_window_items:[{listing_id:listing.id,listings:listing}],reviews:[{id:'r',rating:5,comment:'Delicious and fresh.',created_at:now,users:user}],payments:[{id:'p',order_id:order.id,seller_amount:31.45,driver_amount:3.99,amount_total:44.33,seller_payout_status:'completed',driver_payout_status:'completed',created_at:now,orders:order}],platform_config:[],order_status_events:[{id:'event',status:'preparing',created_at:now}]})[table]||[];}
function query(table){let data=rows(table),single=false;const q=new Proxy({}, {get(_,key){if(key==='then')return (resolve)=>new Promise(done=>setTimeout(()=>done(resolve({data:window.previewFailure?null:(single?data[0]||null:data),error:window.previewFailure?{message:'Simulated connection error'}:null,count:data.length})),window.previewDelay||0));if(key==='maybeSingle'||key==='single')return()=>{single=true;return q};if(['insert','update','delete','upsert'].includes(key))return()=>{throw Error('Mutations disabled in UI capture')};if(key==='eq')return(k,v)=>{data=data.filter(r=>r[k]===v);return q};if(key==='ilike')return(k,v)=>{data=data.filter(r=>String(r[k]).toLowerCase().includes(v.replace(/%/g,'').toLowerCase()));return q};return()=>q;}});return q;}
const channel=()=>({on(){return this},subscribe(){return this},unsubscribe:noop});
export const supabase={from:query,channel,removeChannel:noop,functions:{invoke:async()=>({data:{charges_enabled:false,payouts_enabled:false,details_submitted:false},error:null})},storage:{from:()=>({createSignedUrl:async()=>({data:null}),getPublicUrl:()=>({data:{publicUrl:photo}})})}};
export const useSession=()=>({user,seller:window.currentPreview==='SellerVerificationPending'?{...seller,verification_status:'pending'}:seller,driver:window.currentPreview==='DriverOnboarding'?null:window.currentPreview==='DriverVerificationPending'?{...driver,verification_status:'pending'}:driver,mode:'customer',refresh,setMode:noop,loading:false});
export const useCart=()=>({seller:{sellerId:seller.id,businessName:seller.business_name,sellerType:'restaurant'},items:[{listing,quantity:2}],itemCount:2,subtotal:37,addItem:noop,setQuantity:noop,removeItem:noop,clearCart:noop,replaceCart:noop});
export const useAuth=()=>({userId:user.id,isLoaded:true,isSignedIn:true,signOut:noop});
export const useUser=()=>({user:{primaryEmailAddress:{emailAddress:user.email},imageUrl:null},isLoaded:true});
export const useSignIn=()=>({isLoaded:true,signIn:{},setActive:noop});
export const useSignUp=()=>({isLoaded:true,signUp:{},setActive:noop});
export const useStripe=()=>({initPaymentSheet:noop,presentPaymentSheet:noop});
export const useNavigation=()=>window.previewNavigation;
export const useFocusEffect=(cb)=>React.useEffect(cb,[cb]);
export const useIsFocused=()=>true;
export const notify={error:noop,success:noop,info:noop,confirm:noop};
export const logger={error:noop,info:noop,warn:noop,debug:noop,log:noop};
export const useScreenLogger=noop;
export const ProfileService={};
export const ORDER_STATUS_LABELS={pending_payment:'Awaiting payment',paid:'Paid',accepted:'Accepted',preparing:'Preparing',ready:'Ready',driver_assigned:'Driver assigned',picked_up:'Picked up',en_route:'On the way',delivered:'Delivered',cancelled:'Cancelled',refunded:'Refunded'};
export const OrderService={subscribeToOrder:channel,subscribeToSellerOrders:channel,subscribeToDeliveryLocation:channel};
export const DeliveryLocationService={startTracking:async()=>false,stopTracking:noop};
export const useCurrentLocation=()=>({location:null,loading:false});
export const getRouteWithDetails=async()=>null;
export const maybeCompleteAuthSession=noop;
export const MediaTypeOptions={Images:'images'};
export const DateTimePickerAndroid={open:noop,dismiss:noop};
export const requestForegroundPermissionsAsync=async()=>({status:'denied'});
export const getCurrentPositionAsync=async()=>null;
export const Accuracy={Balanced:3};
export const openBrowserAsync=async()=>({type:'cancel'});
export const requestMediaLibraryPermissionsAsync=async()=>({granted:false});
export const launchImageLibraryAsync=async()=>({canceled:true});
export default function NativePlaceholder(props){if(props.visible===false)return null;return <View style={[{height:220,backgroundColor:'#E9EEE2',alignItems:'center',justifyContent:'center'},props.style]}><Text style={{color:'#205A3C'}}>Native map / picker preview</Text></View>}
