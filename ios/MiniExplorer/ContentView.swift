//
//  ContentView.swift
//  MiniExplorer
//
//  Created by Kai Xiao on 1/27/26.
//

import SwiftUI

/// Phase 5.4: Main UI entry.
///
/// - TabView: Explore / Companion
/// - Shared AppModel (services must not be recreated on tab switches)
struct ContentView: View {
    @StateObject private var model = AppModel()

    var body: some View {
        TabView(selection: $model.mode) {
            NavigationStack {
                ExploreView(model: model)
            }
            .tabItem { Label("探索", systemImage: "camera") }
            .tag(AppModel.Mode.explore)

            NavigationStack {
                CompanionView(model: model)
            }
            .tabItem { Label("陪伴", systemImage: "person.fill") }
            .tag(AppModel.Mode.companion)

#if DEBUG
            // Debug surface (not part of the product UX)
            NavigationStack {
                AudioTestView()
            }
            .tabItem { Label("Debug", systemImage: "wrench.and.screwdriver") }
#endif
        }
        .onAppear { model.bootIfNeeded() }
        .onChange(of: model.mode) { _, newValue in
            model.applyMode(newValue)
        }
    }
}

#Preview {
    ContentView()
}
