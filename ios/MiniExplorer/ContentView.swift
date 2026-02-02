//
//  ContentView.swift
//  MiniExplorer
//
//  Created by Kai Xiao on 1/27/26.
//

import SwiftUI

/// Main entry now follows prototype home (no Tab).
struct ContentView: View {
    @StateObject private var model = AppModel()

    var body: some View {
        ZStack {
            NavigationStack {
                HomeView(model: model)
            }

            BridgeWebView(service: model.realtime)
                .frame(width: 1, height: 1)
                .opacity(0.01)
                .allowsHitTesting(false)
        }
        .onAppear { model.bootBasicsIfNeeded() }
    }
}

#Preview {
    ContentView()
}
