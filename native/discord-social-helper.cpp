// SPDX-License-Identifier: MIT
// Standalone read-only Discord adapter. No Argus GPL code is linked into this process.
// Protocol: bounded tab/base64 stdin commands, JSON stdout events. stdout is a private pipe,
// NEVER a log: token events are consumed only by the parent credential controller.
#define DISCORDPP_IMPLEMENTATION
#include "discordpp.h"
#include <windows.h>
#include <wincrypt.h>
#include <chrono>
#include <filesystem>
#include <iostream>
#include <mutex>
#include <queue>
#include <sstream>
#include <thread>
#include <unordered_set>
static constexpr uint64_t APP_ID=1561783830648594512ULL;
std::string b64(const std::string& s){DWORD n=0;CryptBinaryToStringA((const BYTE*)s.data(),(DWORD)s.size(),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,nullptr,&n);std::string out(n,'\0');CryptBinaryToStringA((const BYTE*)s.data(),(DWORD)s.size(),CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,out.data(),&n);out.resize(n);while(!out.empty()&&out.back()=='\0')out.pop_back();return out;}
std::string un64(const std::string& s){DWORD n=0;if(!CryptStringToBinaryA(s.c_str(),(DWORD)s.size(),CRYPT_STRING_BASE64,nullptr,&n,nullptr,nullptr))return {};std::string out(n,'\0');if(!CryptStringToBinaryA(s.c_str(),(DWORD)s.size(),CRYPT_STRING_BASE64,(BYTE*)out.data(),&n,nullptr,nullptr))return {};out.resize(n);return out;}
void phase(const char* value){std::cout<<"{\"type\":\"phase\",\"value\":\""<<value<<"\"}"<<std::endl;}
int main(int argc,char** argv){
 if(argc==2&&std::string(argv[1])=="--check"){std::cout<<"{\"protocol\":1,\"applicationId\":\"1561783830648594512\",\"scopes\":\"openid sdk.social_layer_presence\"}"<<std::endl;return 0;}
 auto client=std::make_shared<discordpp::Client>();
 client->SetLogDir(std::filesystem::current_path().string(),discordpp::LoggingSeverity::None);
 client->SetVoiceLogDir(std::filesystem::current_path().string(),discordpp::LoggingSeverity::None);
 client->SetApplicationId(APP_ID);
 if(argc==3&&std::string(argv[1])=="--window-pid"){try{client->SetGameWindowPid(std::stoi(argv[2]));}catch(...){return 2;}}
 std::mutex lock;std::queue<std::string> commands;bool stopped=false,connected=false,dirty=false;unsigned epoch=0;std::string refresh;
 // Reader owns no SDK state. SDK calls and callbacks run exclusively on the main thread.
 std::thread([&]{std::string line;while(std::getline(std::cin,line)){if(line.size()>16384)break;std::lock_guard<std::mutex> guard(lock);commands.push(line);}std::lock_guard<std::mutex> guard(lock);commands.push("stop");}).detach();
 auto snapshot=[&]{
  if(!connected)return;auto me=client->GetCurrentUserV2();if(!me)return;
  std::cout<<"{\"type\":\"snapshot\",\"account\":{\"id\":\""<<me->Id()<<"\",\"name64\":\""<<b64(me->DisplayName())<<"\"},\"friends\":[";
  bool first=true;std::unordered_set<uint64_t> seen;
  for(auto& r:client->GetRelationships()){
   if(r.DiscordRelationshipType()!=discordpp::RelationshipType::Friend)continue;auto user=r.User();if(!user||!seen.insert(user->Id()).second||seen.size()>1000)continue;
   if(!first)std::cout<<",";first=false;
   std::cout<<"{\"id\":\""<<user->Id()<<"\",\"name64\":\""<<b64(user->DisplayName())<<"\",\"status\":"<<static_cast<int>(user->Status())<<"}";
  }std::cout<<"]}"<<std::endl;
 };
 auto error=[&](const char* value){connected=false;dirty=false;phase(value);};
 auto update=[&](std::string access,unsigned attempt){client->UpdateToken(discordpp::AuthorizationTokenType::Bearer,access,[&,attempt](auto result){if(attempt!=epoch)return;if(result.Successful()){if(connected){dirty=true;}else{phase("connecting");client->Connect();}}else error("expired");});};
 auto exchange=[&](unsigned attempt){return [&,attempt](auto result,std::string access,std::string nextRefresh,auto,int32_t expires,std::string){
  if(attempt!=epoch)return;if(!result.Successful()){error(result.Type()==discordpp::ErrorType::NetworkError?"connection-error":"expired");return;}refresh=nextRefresh;
  std::cout<<"{\"type\":\"tokens\",\"access64\":\""<<b64(access)<<"\",\"refresh64\":\""<<b64(refresh)<<"\",\"expiresIn\":"<<expires<<"}"<<std::endl;update(access,attempt);
 };};
 client->SetStatusChangedCallback([&](auto status,auto err,int32_t){if(status==discordpp::Client::Status::Ready){connected=true;dirty=true;phase("connected");}else if(err!=discordpp::Client::Error::None){error("connection-error");}});
 client->SetUserUpdatedCallback([&](uint64_t){dirty=true;});
 client->SetRelationshipGroupsUpdatedCallback([&](uint64_t){dirty=true;});
 client->SetTokenExpirationCallback([&]{if(!refresh.empty())client->RefreshToken(APP_ID,refresh,exchange(epoch));else error("expired");});
 std::cout<<"{\"type\":\"ready\",\"protocol\":1}"<<std::endl;
 auto nextSnapshot=std::chrono::steady_clock::now();
 while(!stopped){
  std::queue<std::string> pending;{std::lock_guard<std::mutex> guard(lock);pending.swap(commands);}
  while(!pending.empty()){
   std::istringstream in(pending.front());pending.pop();std::string command,a,b;std::getline(in,command,'\t');std::getline(in,a,'\t');std::getline(in,b,'\t');
   if(command=="stop"){++epoch;client->AbortAuthorize();stopped=true;break;}
   if(command=="cancel"){++epoch;client->AbortAuthorize();connected=false;refresh.clear();phase("cancelled");}
   if(command=="authorize"){
    const auto attempt=++epoch;connected=false;refresh.clear();auto verifier=client->CreateAuthorizationCodeVerifier();discordpp::AuthorizationArgs args;
    args.SetClientId(APP_ID);args.SetScopes("openid sdk.social_layer_presence");args.SetCodeChallenge(verifier.Challenge());phase("authorizing");
    client->Authorize(args,[&,attempt,verifier](auto result,auto code,auto redirectUri){if(attempt!=epoch)return;if(!result.Successful()){error(result.Type()==discordpp::ErrorType::Aborted?"cancelled":result.Type()==discordpp::ErrorType::NetworkError?"connection-error":"authorization-error");return;}client->GetToken(APP_ID,code,verifier.Verifier(),redirectUri,exchange(attempt));});
   }
   if(command=="restore"){const auto attempt=++epoch;refresh=un64(b);phase("connecting");update(un64(a),attempt);}
   if(command=="refresh"){const auto attempt=++epoch;refresh=un64(a);phase("connecting");client->RefreshToken(APP_ID,refresh,exchange(attempt));}
   if(command=="revoke"){++epoch;client->AbortAuthorize();connected=false;refresh.clear();client->RevokeToken(APP_ID,un64(a),[&](auto result){phase(result.Successful()?"revoked":"revoke-error");});}
  }
  discordpp::RunCallbacks();const auto now=std::chrono::steady_clock::now();if(dirty&&now>=nextSnapshot){dirty=false;snapshot();nextSnapshot=now+std::chrono::milliseconds(250);}std::this_thread::sleep_for(std::chrono::milliseconds(10));
 }
 // Reader may still be blocked on stdin. The parent closes the pipe and owns process lifetime.
 ExitProcess(0);
}
